import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { parseEnv } from '@/config/env';
import { getServices } from '@/composition';
import { createPool } from '@/db/client';
import { findPortalUserByEmail } from '@/db/users';
import { applyForAccount } from '@/onboarding/apply';
import { isOk } from '@/domain/result';
import type { UploadedFile } from '@/domain/types';

/**
 * Workflow W1 end to end, against the live stack.
 *
 * Each outcome is reached **by construction** rather than by hope. Extraction
 * on a clean render is close to exact, so a referral or a decline would
 * essentially never arise by accident - a suite that only ever saw the approved
 * path would leave two thirds of the rules unproven while passing.
 */

const env = parseEnv({ ...process.env } as Record<string, string | undefined>);
const services = getServices();
let pool: pg.Pool;

const PERSON = {
  surname: 'NAIQAMA',
  givenNames: 'ANA MEREANI',
  dateOfBirth: '14 MAR 1991',
  documentNumber: 'FJ7481239',
};
const CLAIMED = {
  fullName: 'ANA MEREANI NAIQAMA',
  dateOfBirth: '1991-03-14',
  documentNumber: 'FJ7481239',
};

const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function document(quality: string): Promise<UploadedFile> {
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
  pool = createPool(env.PORTAL_DATABASE_URL);
  const health = await fetch(`${env.OCR_URL}/healthz`).catch(() => null);
  if (!health?.ok) throw new Error('the ocr service is not reachable. Run `npm run stack:up`.');
}, 120_000);

afterAll(async () => {
  await pool?.end();
});

describe('W1 - opening an account', () => {
  it('approves a clean document with matching details, and creates both records', async () => {
    const email = `approved-${unique()}@example.test`;
    const result = await applyForAccount(services, pool, {
      ...CLAIMED,
      email,
      password: 'a strong enough phrase',
      document: await document('clean'),
    });

    expect(result.kind).toBe('approved');
    if (result.kind !== 'approved') return;

    // The Odoo partner exists.
    const found = await services.customers.findCustomerByEmail(email);
    expect(isOk(found)).toBe(true);
    if (isOk(found)) expect(found.value).not.toBeNull();

    // And so does the portal credential, pointing at it.
    const user = await findPortalUserByEmail(pool, email);
    expect(user).not.toBeNull();
    expect(user!.odooPartnerId).toBe(result.customerId);
  }, 120_000);

  it('approves a photograph-quality document too', async () => {
    const result = await applyForAccount(services, pool, {
      ...CLAIMED,
      email: `photo-${unique()}@example.test`,
      password: 'a strong enough phrase',
      document: await document('photo'),
    });
    expect(result.kind).toBe('approved');
  }, 120_000);

  it('refers a smudged document rather than declining it', async () => {
    const result = await applyForAccount(services, pool, {
      ...CLAIMED,
      email: `referred-${unique()}@example.test`,
      password: 'a strong enough phrase',
      document: await document('smudged'),
    });
    expect(result.kind).toBe('referred');
    if (result.kind === 'referred') expect(result.reasons).toContain('low_confidence');
  }, 120_000);

  it('refers a clean document when the typed name is a different name', async () => {
    const result = await applyForAccount(services, pool, {
      ...CLAIMED,
      fullName: 'ANA MEREANI DELANA',
      email: `refname-${unique()}@example.test`,
      password: 'a strong enough phrase',
      document: await document('clean'),
    });
    expect(result.kind).toBe('referred');
    if (result.kind === 'referred') expect(result.reasons).toContain('name_mismatch');
  }, 120_000);

  it('declines an illegible document', async () => {
    const result = await applyForAccount(services, pool, {
      ...CLAIMED,
      email: `declined-${unique()}@example.test`,
      password: 'a strong enough phrase',
      document: await document('illegible'),
    });
    expect(result.kind).toBe('declined');
    if (result.kind === 'declined') expect(result.reasons).toContain('document_unreadable');
  }, 120_000);

  it('declines a clean document when the typed number is a different number', async () => {
    const result = await applyForAccount(services, pool, {
      ...CLAIMED,
      documentNumber: 'FJ0000000',
      email: `decnum-${unique()}@example.test`,
      password: 'a strong enough phrase',
      document: await document('clean'),
    });
    expect(result.kind).toBe('declined');
    if (result.kind === 'declined') expect(result.reasons).toContain('document_number_mismatch');
  }, 120_000);

  it('rejects a file that is not an image before reading it', async () => {
    const result = await applyForAccount(services, pool, {
      ...CLAIMED,
      email: `notimage-${unique()}@example.test`,
      password: 'a strong enough phrase',
      document: {
        filename: 'notes.txt',
        mimeType: 'image/png',
        bytes: new TextEncoder().encode('%PDF-1.7 definitely not an image'),
      },
    });
    expect(result.kind).toBe('rejected');
  }, 60_000);

  it('creates no portal credential for a declined application', async () => {
    const email = `nocred-${unique()}@example.test`;
    await applyForAccount(services, pool, {
      ...CLAIMED,
      email,
      password: 'a strong enough phrase',
      document: await document('illegible'),
    });
    expect(await findPortalUserByEmail(pool, email)).toBeNull();
  }, 120_000);

  it('stores what was read but never the image', async () => {
    const email = `stored-${unique()}@example.test`;
    await applyForAccount(services, pool, {
      ...CLAIMED,
      email,
      password: 'a strong enough phrase',
      document: await document('clean'),
    });
    const row = await pool.query(
      'SELECT extracted_text, confidence FROM onboarding_application WHERE email = $1',
      [email],
    );
    expect(row.rowCount).toBe(1);
    const stored = row.rows[0] as { extracted_text: string; confidence: number };
    expect(stored.extracted_text).toContain('NAIQAMA');
    expect(stored.confidence).toBeGreaterThan(0.8);
    // No column holds bytes, asserted directly in db.test.ts; here the point is
    // that the text survives and nothing else does.
    expect(stored.extracted_text).not.toContain('\u0089PNG');
  }, 120_000);
});
