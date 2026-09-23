import { err, type Result } from '@/domain/result';
import type { DocumentOcrPort, OcrError } from '@/ports/ocr';
import type { ExtractedDocument } from '@/domain/types';

/**
 * The OCR port, in a build that accepts no documents.
 *
 * A demonstration build renders no file input and its onboarding handler reads
 * no file, so nothing calls this. It exists rather than being left out because
 * the composition must satisfy the port, and because of what the alternatives
 * would do:
 *
 *   - returning a plausible extraction would make a caller added later appear
 *     to work while reading a document that was never uploaded
 *   - leaving it undefined would fail at the call site with a null reference,
 *     which says nothing about why
 *
 * Refusing says exactly what happened. If this message ever reaches a log, a
 * build that accepts no documents has been asked to read one, and that is worth
 * knowing immediately.
 */
export class UnavailableOcrAdapter implements DocumentOcrPort {
  async read(): Promise<Result<ExtractedDocument, OcrError>> {
    return err({
      kind: 'unavailable',
      message:
        'this build accepts no identity documents, so there is nothing to read - ' +
        'see DEMO_MODE in src/config/env.ts',
    });
  }
}
