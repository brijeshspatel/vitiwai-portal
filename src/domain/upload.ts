import { err, ok, type PortError, type Result } from '@/domain/result';
import type { UploadedFile } from '@/domain/types';

/**
 * Upload validation, before the bytes reach anything that parses them.
 *
 * The declared type is checked **against the magic bytes**, not instead of
 * them. A declared type that disagrees with the content is the signature of a
 * file pretending to be an image, and it is the case a check on either one
 * alone lets through.
 */

export type UploadErrorKind = 'unsupported_type' | 'too_large' | 'empty' | 'type_mismatch';
export type UploadError = PortError<UploadErrorKind>;

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const SIGNATURES = {
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/jpeg': [0xff, 0xd8, 0xff],
} as const;

export type AcceptedMimeType = keyof typeof SIGNATURES;

export const ACCEPTED_TYPES = Object.keys(SIGNATURES) as AcceptedMimeType[];

const matches = (bytes: Uint8Array, signature: readonly number[]): boolean =>
  bytes.length >= signature.length && signature.every((byte, i) => bytes[i] === byte);

/** Returns the type the bytes actually are, or null when they are not an image we accept. */
export function detectImageType(bytes: Uint8Array): AcceptedMimeType | null {
  for (const type of ACCEPTED_TYPES) {
    if (matches(bytes, SIGNATURES[type])) return type;
  }
  return null;
}

export function validateUpload(file: UploadedFile): Result<UploadedFile, UploadError> {
  if (file.bytes.length === 0) {
    return err({ kind: 'empty', message: 'no file was uploaded' });
  }

  if (file.bytes.length > MAX_UPLOAD_BYTES) {
    return err({
      kind: 'too_large',
      message: `the file is larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB`,
    });
  }

  const actual = detectImageType(file.bytes);
  if (actual === null) {
    return err({
      kind: 'unsupported_type',
      message: 'the file is not a PNG or JPEG image',
    });
  }

  if (!ACCEPTED_TYPES.includes(file.mimeType as AcceptedMimeType)) {
    return err({
      kind: 'unsupported_type',
      message: `${file.mimeType} is not accepted; upload a PNG or JPEG`,
    });
  }

  if (file.mimeType !== actual) {
    return err({
      kind: 'type_mismatch',
      message: `the file says it is ${file.mimeType} but its contents are ${actual}`,
    });
  }

  return ok(file);
}
