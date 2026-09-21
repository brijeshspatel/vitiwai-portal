import type { PortError, Result } from '@/domain/result';
import type { ExtractedDocument, UploadedFile } from '@/domain/types';

export type OcrErrorKind = 'unreadable' | 'unsupported_type' | 'too_large' | 'unavailable';
export type OcrError = PortError<OcrErrorKind>;

/**
 * Reads an identity document.
 *
 * Declared in increment 1A and implemented in 1B. Declaring it now is what
 * keeps 1B additive: the onboarding route is written against this interface
 * before the service behind it exists.
 */
export interface DocumentOcrPort {
  read(file: UploadedFile): Promise<Result<ExtractedDocument, OcrError>>;
}
