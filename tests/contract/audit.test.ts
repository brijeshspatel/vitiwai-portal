import { beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { parseEnv } from '@/config/env';
import { BASE, portalIsUp, signIn } from './portal';

/**
 * Every state change leaves a row.
 *
 * Each case drives the change through HTTP and then reads the table, so it
 * proves the handler writes the row - not that the writer works, which the unit
 * test covers.
 */

const env = parseEnv({ ...process.env } as Record<string, string | undefined>);
let pool: pg.Pool;

beforeAll(async () => {
  if (!(await portalIsUp())) {
    throw new Error(`the portal is not answering at ${BASE}. Run \`npm run build && npm start\`.`);
  }
  pool = new pg.Pool({ connectionString: env.PORTAL_DATABASE_URL });
}, 120_000);

const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

async function countSince(action: string, since: Date): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM audit_event WHERE action = $1 AND occurred_at >= $2`,
    [action, since],
  );
  return Number(rows[0]?.n ?? 0);
}

async function tokenFor(page: string, session?: string) {
  const res = await fetch(`${BASE}${page}`, { headers: session ? { cookie: session } : {} });
  const html = await res.text();
  const field = /name="_csrf"\s+value="([^"]+)"/.exec(html)?.[1] ?? '';
  const set = (res.headers.getSetCookie?.() ?? [])
    .filter((c) => c.startsWith('vitiwai_csrf='))
    .map((c) => c.split(';')[0])
    .join('; ');
  return { field, jar: [session, set || `vitiwai_csrf=${field}`].filter(Boolean).join('; ') };
}

describe('the trail records', () => {
  it('a successful sign-in', async () => {
    const since = new Date();
    await signIn();
    expect(await countSince('signin.succeeded', since)).toBeGreaterThan(0);
  }, 120_000);

  it('a failed sign-in, with no password anywhere in the row', async () => {
    const since = new Date();
    const { field, jar } = await tokenFor('/signin');
    await fetch(`${BASE}/signin/submit`, {
      method: 'POST',
      headers: { cookie: jar, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        email: `audit-${unique()}@example.test`,
        password: 'definitely-not-the-password',
        _csrf: field,
      }),
      redirect: 'manual',
    });
    expect(await countSince('signin.failed', since)).toBeGreaterThan(0);

    const { rows } = await pool.query<{ detail: Record<string, unknown> }>(
      `SELECT detail FROM audit_event WHERE action = 'signin.failed' AND occurred_at >= $1`,
      [since],
    );
    for (const row of rows) {
      expect(JSON.stringify(row.detail)).not.toContain('definitely-not-the-password');
      expect(Object.keys(row.detail)).not.toContain('password');
    }
  }, 120_000);

  it('a fault report', async () => {
    const since = new Date();
    const session = await signIn();
    const { field, jar } = await tokenFor('/account/support', session);
    await fetch(`${BASE}/account/support/submit`, {
      method: 'POST',
      headers: { cookie: jar, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ title: `Audit probe ${unique()}`, description: 'x', _csrf: field }),
      redirect: 'manual',
    });
    expect(await countSince('case.opened', since)).toBeGreaterThan(0);
  }, 180_000);

  it('a plan-change request', async () => {
    const since = new Date();
    const session = await signIn();
    const { field, jar } = await tokenFor('/account/change-plan', session);
    await fetch(`${BASE}/account/change-plan/submit`, {
      method: 'POST',
      headers: { cookie: jar, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ planId: 'plan-bundle-2', _csrf: field }),
      redirect: 'manual',
    });
    expect(await countSince('planchange.requested', since)).toBeGreaterThan(0);
  }, 180_000);

  it('a sign-out', async () => {
    const since = new Date();
    const session = await signIn();
    const { field, jar } = await tokenFor('/account', session);
    await fetch(`${BASE}/signout`, {
      method: 'POST',
      headers: { cookie: jar, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: field }),
      redirect: 'manual',
    });
    expect(await countSince('signout', since)).toBeGreaterThan(0);
  }, 180_000);
});

describe('the table itself', () => {
  it('holds no column that looks like a credential', async () => {
    const { rows } = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'audit_event'`,
    );
    const names = rows.map((r) => r.column_name);
    expect(names.length, 'audit_event has no columns - is migration 003 applied?').toBeGreaterThan(4);
    for (const name of names) {
      expect(name).not.toMatch(/pass|token|secret|cookie/i);
    }
  }, 60_000);

  it('carries an actor wherever one was known', async () => {
    const since = new Date();
    await signIn();
    const { rows } = await pool.query<{ actor_user: string | null }>(
      `SELECT actor_user FROM audit_event
        WHERE action = 'signin.succeeded' AND occurred_at >= $1`,
      [since],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.actor_user).not.toBeNull();
  }, 120_000);
});
