/**
 * Contract tests for the OCR adapter, against the running services.
 *
 * `docgen` supplies the fixtures, so the tests do not carry binary files and a
 * change to the renderer is caught here rather than in a stale asset.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { parseEnv } from '@/config/env';
import { HttpOcrAdapter } from '@/adapters/ocr/http';
import { isErr, isOk } from '@/domain/result';
import type { UploadedFile } from '@/domain/types';

const env = parseEnv({ ...process.env } as Record<string, string | undefined>);
const ocr = new HttpOcrAdapter(env.OCR_URL);

const PERSON = {
  surname: 'NAIQAMA',
  givenNames: 'ANA MEREANI',
  dateOfBirth: '14 MAR 1991',
  documentNumber: 'FJ7481239',
};

async function render(quality: string): Promise<UploadedFile> {
  const response = await fetch(`${env.DOCGEN_URL}/v1/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...PERSON, quality }),
  });
  if (!response.ok) throw new Error(`docgen returned HTTP ${response.status}`);
  return {
    filename: `${quality}.png`,
    mimeType: 'image/png',
    bytes: new Uint8Array(await response.arrayBuffer()),
  };
}

beforeAll(async () => {
  const health = await fetch(`${env.OCR_URL}/healthz`).catch(() => null);
  if (!health?.ok) {
    throw new Error(`the ocr service is not reachable at ${env.OCR_URL}. Run \`npm run stack:up\`.`);
  }
}, 60_000);

describe('HttpOcrAdapter', () => {
  it('reads every field from a clean render, above the 0.80 threshold', async () => {
    const result = await ocr.read(await render('clean'));
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.confidence).toBeGreaterThanOrEqual(0.8);
    expect(result.value.documentNumber).toBe('FJ7481239');
    expect(result.value.fullName).toBe('ANA MEREANI NAIQAMA');
    expect(result.value.dateOfBirth).toBe('1991-03-14');
  });

  it('reads a photograph-like render just as well', async () => {
    const result = await ocr.read(await render('photo'));
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.confidence).toBeGreaterThanOrEqual(0.8);
    expect(result.value.documentNumber).toBe('FJ7481239');
  });

  it('returns low confidence and no fields for a smudged render, not a guess', async () => {
    const result = await ocr.read(await render('smudged'));
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    // The referral band. Guessing a document number here would be worse than
    // returning nothing, because the decision rules would then trust it.
    expect(result.value.confidence).toBeGreaterThan(0.3);
    expect(result.value.confidence).toBeLessThan(0.6);
    expect(result.value.documentNumber).toBeNull();
  });

  it('reports an illegible render as unreadable rather than inventing fields', async () => {
    const result = await ocr.read(await render('illegible'));
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe('unreadable');
  });

  it('refuses a body that is not an image', async () => {
    const result = await ocr.read({
      filename: 'notes.txt',
      mimeType: 'text/plain',
      bytes: new TextEncoder().encode('this is not an image'),
    });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.kind).toBe('unsupported_type');
  });

  it('returns a Result rather than throwing when the service is down', async () => {
    // Port 8099 has nothing on it. A thrown error here would become an
    // unhandled 500 in a route handler.
    const offline = new HttpOcrAdapter('http://localhost:8099');
    const result = await offline.read(await render('clean'));
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.kind).toBe('unavailable');
  });
});
