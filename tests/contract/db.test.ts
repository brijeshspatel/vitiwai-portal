import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { parseEnv } from '@/config/env';
import { createPool } from '@/db/client';
import { createPortalUser, findPortalUserByEmail, recordApplication } from '@/db/users';
import { verifyPassword } from '@/domain/password';

const env = parseEnv({ ...process.env } as Record<string, string | undefined>);
let pool: pg.Pool;

const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

beforeAll(async () => {
  pool = createPool(env.PORTAL_DATABASE_URL);
  // Fails loudly if the migration has not run, rather than as a confusing
  // "relation does not exist" inside the first test.
  const tables = await pool.query(
    "SELECT tablename FROM pg_tables WHERE tablename IN ('portal_user','onboarding_application')",
  );
  if (tables.rowCount !== 2) {
    throw new Error('the portal schema is missing. Run `npm run migrate` first.');
  }
}, 60_000);

afterAll(async () => {
  await pool?.end();
});

describe('portal_user', () => {
  it('round-trips a user and its password hash', async () => {
    const email = `roundtrip-${unique()}@example.test`;
    const created = await createPortalUser(pool, {
      email,
      password: 'a strong enough phrase',
      odooPartnerId: '4242',
    });
    expect(created.email).toBe(email.toLowerCase());
    expect(created.odooPartnerId).toBe('4242');

    const found = await findPortalUserByEmail(pool, email);
    expect(found).not.toBeNull();
    expect(await verifyPassword('a strong enough phrase', found!.passwordHash)).toBe(true);
    expect(await verifyPassword('the wrong phrase', found!.passwordHash)).toBe(false);
  });

  it('stores no plaintext password in the column', async () => {
    const email = `plaintext-${unique()}@example.test`;
    await createPortalUser(pool, { email, password: 'vitiwai-secret-phrase', odooPartnerId: '1' });
    const found = await findPortalUserByEmail(pool, email);
    expect(found!.passwordHash).not.toContain('vitiwai-secret-phrase');
    expect(found!.passwordHash.startsWith('scrypt$')).toBe(true);
  });

  it('matches an email regardless of the case it was typed in', async () => {
    const email = `MixedCase-${unique()}@Example.Test`;
    await createPortalUser(pool, { email, password: 'phrase', odooPartnerId: '7' });
    expect(await findPortalUserByEmail(pool, email.toUpperCase())).not.toBeNull();
  });

  it('refuses a duplicate email', async () => {
    const email = `dupe-${unique()}@example.test`;
    await createPortalUser(pool, { email, password: 'phrase', odooPartnerId: '1' });
    await expect(
      createPortalUser(pool, { email, password: 'phrase', odooPartnerId: '2' }),
    ).rejects.toThrow();
  });
});

describe('onboarding_application', () => {
  it('accepts each of the three outcomes', async () => {
    const outcomes = [
      { kind: 'approved', matchedFields: ['documentNumber'] },
      { kind: 'referred', reasons: ['low_confidence'] },
      { kind: 'declined', reasons: ['document_unreadable'] },
    ] as const;

    for (const outcome of outcomes) {
      const id = await recordApplication(pool, {
        email: `outcome-${unique()}@example.test`,
        outcome,
        extractedText: 'SURNAME NAIQAMA',
        confidence: 0.93,
      });
      expect(Number(id)).toBeGreaterThan(0);
    }
  });

  it('refuses an outcome the rules cannot produce', async () => {
    // The CHECK constraint is the last line of defence if a caller ever invents
    // a fourth outcome. Proving it fires is what makes it a constraint rather
    // than a comment.
    await expect(
      pool.query('INSERT INTO onboarding_application (email, outcome) VALUES ($1, $2)', [
        `bad-${unique()}@example.test`,
        'maybe',
      ]),
    ).rejects.toThrow();
  });

  it('has no column that could hold an uploaded image', async () => {
    const columns = await pool.query(
      'SELECT data_type FROM information_schema.columns WHERE table_name = $1',
      ['onboarding_application'],
    );
    const types = columns.rows.map((r) => (r as { data_type: string }).data_type);
    expect(types).not.toContain('bytea');
  });
});
