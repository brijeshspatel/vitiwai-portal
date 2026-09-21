import { err, ok, type Result } from '@/domain/result';
import type { DocumentOcrPort, OcrError } from '@/ports/ocr';
import type { ExtractedDocument, UploadedFile } from '@/domain/types';

/**
 * Reads an identity document through the `ocr` service.
 *
 * The image travels in the request body. It is never written to disk here, and
 * never shared through a volume: Docker Desktop on the development machine
 * refuses to bind-mount the working path, so a filesystem design would have
 * failed at implementation time.
 */

/** Below this, nothing read is trustworthy and the document counts as unreadable. */
const UNREADABLE_BELOW = 0.3;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

interface OcrResponse {
  rawText: string;
  fields: {
    surname: string | null;
    givenNames: string | null;
    dateOfBirth: string | null;
    documentNumber: string | null;
  };
  confidence: number;
  wordCount: number;
}

const startsWith = (bytes: Uint8Array, magic: number[]): boolean =>
  magic.every((byte, i) => bytes[i] === byte);

export class HttpOcrAdapter implements DocumentOcrPort {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 30_000,
  ) {}

  async read(file: UploadedFile): Promise<Result<ExtractedDocument, OcrError>> {
    // Checked here as well as at the route, because an adapter that trusts its
    // caller is one refactor away from not being checked at all.
    if (!startsWith(file.bytes, PNG_MAGIC) && !startsWith(file.bytes, JPEG_MAGIC)) {
      return err({
        kind: 'unsupported_type',
        message: 'the file is not a PNG or JPEG image',
      });
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/v1/read`, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: file.bytes as BodyInit,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      return err({
        kind: 'unavailable',
        message: `the ocr service did not answer at ${this.baseUrl}`,
        cause,
      });
    }

    if (response.status === 415) {
      return err({ kind: 'unsupported_type', message: 'the ocr service rejected the file type' });
    }
    if (!response.ok) {
      return err({
        kind: 'unavailable',
        message: `the ocr service returned HTTP ${response.status}`,
      });
    }

    let body: OcrResponse;
    try {
      body = (await response.json()) as OcrResponse;
    } catch (cause) {
      return err({ kind: 'unavailable', message: 'the ocr service returned invalid JSON', cause });
    }

    if (body.wordCount === 0 || body.confidence < UNREADABLE_BELOW) {
      return err({
        kind: 'unreadable',
        message: `nothing legible was found (confidence ${body.confidence.toFixed(2)})`,
      });
    }

    const { surname, givenNames, dateOfBirth, documentNumber } = body.fields;

    return ok({
      rawText: body.rawText,
      documentNumber: documentNumber,
      // The card prints the two apart; the portal's own type carries one name.
      fullName: givenNames && surname ? `${givenNames} ${surname}` : (surname ?? givenNames),
      dateOfBirth: dateOfBirth,
      confidence: body.confidence,
    });
  }
}
