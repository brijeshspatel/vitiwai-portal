import { describe, expect, it } from 'vitest';
import { detectImageType, MAX_UPLOAD_BYTES, validateUpload } from '@/domain/upload';
import { isErr, isOk } from '@/domain/result';
import type { UploadedFile } from '@/domain/types';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]);

const file = (over: Partial<UploadedFile>): UploadedFile => ({
  filename: 'document.png',
  mimeType: 'image/png',
  bytes: PNG,
  ...over,
});

describe('detectImageType', () => {
  it('recognises PNG and JPEG from their signatures', () => {
    expect(detectImageType(PNG)).toBe('image/png');
    expect(detectImageType(JPEG)).toBe('image/jpeg');
  });

  it('returns null for anything else', () => {
    expect(detectImageType(new TextEncoder().encode('%PDF-1.7'))).toBeNull();
    expect(detectImageType(new Uint8Array([]))).toBeNull();
  });
});

describe('validateUpload', () => {
  it('accepts a PNG that says it is a PNG', () => {
    expect(isOk(validateUpload(file({})))).toBe(true);
  });

  it('accepts a JPEG that says it is a JPEG', () => {
    const result = validateUpload(file({ mimeType: 'image/jpeg', bytes: JPEG }));
    expect(isOk(result)).toBe(true);
  });

  it('rejects a PNG declared as a JPEG', () => {
    // The case a check on the declared type alone, or the bytes alone, lets
    // through. Disagreement is the signal.
    const result = validateUpload(file({ mimeType: 'image/jpeg', bytes: PNG }));
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.kind).toBe('type_mismatch');
  });

  it('rejects a file that is not an image at all', () => {
    const result = validateUpload(
      file({ mimeType: 'image/png', bytes: new TextEncoder().encode('%PDF-1.7 not an image') }),
    );
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.kind).toBe('unsupported_type');
  });

  it('rejects an accepted-looking type the project does not take', () => {
    const result = validateUpload(file({ mimeType: 'image/gif' }));
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.kind).toBe('unsupported_type');
  });

  it('rejects a file over the size limit', () => {
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    big.set(PNG.subarray(0, 8));
    const result = validateUpload(file({ bytes: big }));
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.kind).toBe('too_large');
  });

  it('accepts a file exactly at the limit', () => {
    const exact = new Uint8Array(MAX_UPLOAD_BYTES);
    exact.set(PNG.subarray(0, 8));
    expect(isOk(validateUpload(file({ bytes: exact })))).toBe(true);
  });

  it('rejects an empty upload with its own reason', () => {
    const result = validateUpload(file({ bytes: new Uint8Array([]) }));
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.kind).toBe('empty');
  });
});
