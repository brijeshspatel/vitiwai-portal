import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { parseEnv } from '@/config/env';
import { createPool } from '@/db/client';
import { createPortalUser } from '@/db/users';
import {
  createSession,
  deleteExpiredSessions,
  deleteSession,
  newSessionId,
  readSession,
} from '@/auth/session';

const env = parseEnv({ ...process.env } as Record<string, string | undefined>);
let pool: pg.Pool;

const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function aUser() {
  const email = `session-${unique()}@example.test`;
  const user = await createPortalUser(pool, {
    email,
    password: 'a strong enough phrase',
    odooPartnerId: '4242',
  });
  return { email, user };
}

beforeAll(async () => {
  pool = createPool(env.PORTAL_DATABASE_URL);
  const tables = await pool.query(
    "SELECT tablename FROM pg_tables WHERE tablename IN ('portal_session','payment')",
  );
  if (tables.rowCount !== 2) {
    throw new Error('migration 002 has not run. Run `npm run migrate` first.');
  }
}, 60_000);

afterAll(async () => {
  await pool?.end();
});

describe('sessions', () => {
  it('round-trips a session to its user', async () => {
    const { email, user } = await aUser();
    const id = await createSession(pool, user.id);

    const read = await readSession(pool, id);
    expect(read).not.toBeNull();
    expect(read!.email).toBe(email.toLowerCase());
    expect(read!.odooPartnerId).toBe('4242');
  });

  it('refuses an identifier nobody issued', async () => {
    expect(await readSession(pool, newSessionId())).toBeNull();
  });

  it('refuses an empty identifier without querying', async () => {
    expect(await readSession(pool, '')).toBeNull();
  });

  it('refuses an expired session', async () => {
    const { user } = await aUser();
    const id = newSessionId();
    // Written already expired, rather than waiting twelve hours.
    await pool.query(
      "INSERT INTO portal_session (id, user_id, expires_at) VALUES ($1, $2, now() - interval '1 second')",
      [id, user.id],
    );
    expect(await readSession(pool, id)).toBeNull();
  });

  it('stops working the moment it is deleted', async () => {
    const { user } = await aUser();
    const id = await createSession(pool, user.id);
    expect(await readSession(pool, id)).not.toBeNull();

    await deleteSession(pool, id);

    // The point of server-side sessions: signing out kills the session
    // everywhere, not just in the browser that asked.
    expect(await readSession(pool, id)).toBeNull();
  });

  it('removes a user\'s sessions when the user goes', async () => {
    const { user } = await aUser();
    const id = await createSession(pool, user.id);
    await pool.query('DELETE FROM portal_user WHERE id = $1', [user.id]);
    expect(await readSession(pool, id)).toBeNull();
  });

  it('sweeps expired rows without touching live ones', async () => {
    const { user } = await aUser();
    const live = await createSession(pool, user.id);
    const dead = newSessionId();
    await pool.query(
      "INSERT INTO portal_session (id, user_id, expires_at) VALUES ($1, $2, now() - interval '1 hour')",
      [dead, user.id],
    );

    await deleteExpiredSessions(pool);

    expect(await readSession(pool, live)).not.toBeNull();
    const rows = await pool.query('SELECT 1 FROM portal_session WHERE id = $1', [dead]);
    expect(rows.rowCount).toBe(0);
  });
});

describe('the payment table protects against paying twice', () => {
  it('refuses a repeated idempotency key', async () => {
    const { user } = await aUser();
    const key = `key-${unique()}`;
    const insert = () =>
      pool.query(
        `INSERT INTO payment (idempotency_key, user_id, invoice_id, amount_minor, status)
         VALUES ($1, $2, $3, $4, 'succeeded')`,
        [key, user.id, `inv-${unique()}`, 1000],
      );
    await insert();
    await expect(insert()).rejects.toThrow();
  });

  it('refuses a second successful payment for one invoice, even under a different key', async () => {
    // The backstop the idempotency key cannot provide: two tabs, two keys,
    // one invoice.
    const { user } = await aUser();
    const invoice = `inv-${unique()}`;
    const insert = (key: string) =>
      pool.query(
        `INSERT INTO payment (idempotency_key, user_id, invoice_id, amount_minor, status)
         VALUES ($1, $2, $3, $4, 'succeeded')`,
        [key, user.id, invoice, 1000],
      );
    await insert(`a-${unique()}`);
    await expect(insert(`b-${unique()}`)).rejects.toThrow();
  });

  it('allows several declined attempts on one invoice', async () => {
    const { user } = await aUser();
    const invoice = `inv-${unique()}`;
    for (let i = 0; i < 3; i += 1) {
      await pool.query(
        `INSERT INTO payment (idempotency_key, user_id, invoice_id, amount_minor, status, decline_reason)
         VALUES ($1, $2, $3, $4, 'declined', 'card_declined')`,
        [`d${i}-${unique()}`, user.id, invoice, 1000],
      );
    }
    const rows = await pool.query('SELECT count(*) FROM payment WHERE invoice_id = $1', [invoice]);
    expect(Number((rows.rows[0] as { count: string }).count)).toBe(3);
  });

  it('refuses a non-positive amount', async () => {
    const { user } = await aUser();
    await expect(
      pool.query(
        `INSERT INTO payment (idempotency_key, user_id, invoice_id, amount_minor, status)
         VALUES ($1, $2, $3, 0, 'succeeded')`,
        [`zero-${unique()}`, user.id, `inv-${unique()}`],
      ),
    ).rejects.toThrow();
  });
});
