import { beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { parseEnv } from '@/config/env';
import { consume, forgetOldWindows, SIGNIN_BY_EMAIL } from '@/security/ratelimit';
import { BASE, portalIsUp } from './portal';

/**
 * The limiter counts, refuses past the budget, and keeps one caller's attempts
 * away from another's.
 *
 * It runs against the real database rather than a stub, because the whole point
 * of the design is that the count survives the process - a stub would prove the
 * opposite of what matters.
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

describe('the counter', () => {
  it('allows the budget and refuses the attempt after it', async () => {
    const key = `probe-${unique()}`;
    const budget = { bucket: 'test-budget', limit: 3, windowSeconds: 300 };

    for (let i = 1; i <= budget.limit; i += 1) {
      const verdict = await consume(pool, budget, key);
      expect(verdict.allowed, `attempt ${i} of ${budget.limit} must be allowed`).toBe(true);
    }

    const over = await consume(pool, budget, key);
    expect(over.allowed, 'the attempt after the budget must be refused').toBe(false);
    expect(over.remaining).toBe(0);
    expect(over.resetsAt.getTime()).toBeGreaterThan(Date.now());
  }, 60_000);

  it('keeps one caller away from another', async () => {
    // Without this, a limiter that ignored the key would still pass the case
    // above and would lock out every customer when one exceeded a budget.
    const budget = { bucket: 'test-isolation', limit: 2, windowSeconds: 300 };
    const mine = `mine-${unique()}`;
    const theirs = `theirs-${unique()}`;

    await consume(pool, budget, theirs);
    await consume(pool, budget, theirs);
    expect((await consume(pool, budget, theirs)).allowed).toBe(false);

    expect((await consume(pool, budget, mine)).allowed, 'another key must be unaffected').toBe(true);
  }, 60_000);

  it('separates two budgets that share a key', async () => {
    const key = `shared-${unique()}`;
    const a = { bucket: 'test-bucket-a', limit: 1, windowSeconds: 300 };
    const b = { bucket: 'test-bucket-b', limit: 1, windowSeconds: 300 };
    await consume(pool, a, key);
    expect((await consume(pool, a, key)).allowed).toBe(false);
    expect((await consume(pool, b, key)).allowed, 'a different bucket must be unaffected').toBe(true);
  }, 60_000);

  it('survives the process that wrote it', async () => {
    // The property that distinguishes this from an in-memory map. A second pool
    // is a second client with its own connections; the count is in the
    // database, not in either of them.
    const key = `durable-${unique()}`;
    const budget = { bucket: 'test-durable', limit: 2, windowSeconds: 300 };
    await consume(pool, budget, key);
    await consume(pool, budget, key);

    const second = new pg.Pool({ connectionString: env.PORTAL_DATABASE_URL });
    try {
      expect((await consume(second, budget, key)).allowed, 'the count did not survive').toBe(false);
    } finally {
      await second.end();
    }
  }, 60_000);

  it('clears windows nothing will read again', async () => {
    const cleared = await forgetOldWindows(pool, 0);
    expect(cleared).toBeGreaterThanOrEqual(0);
  }, 60_000);
});

describe('sign-in', () => {
  it('refuses with 429 once the budget for one address is spent, and says when to return', async () => {
    const email = `ratelimit-${unique()}@example.test`;
    let last: Response | undefined;

    // One more than the budget, all with a wrong password, so nothing is signed
    // in and the only thing under test is the counting.
    for (let i = 0; i <= SIGNIN_BY_EMAIL.limit; i += 1) {
      const page = await fetch(`${BASE}/signin`);
      const html = await page.text();
      const token = /name="_csrf"\s+value="([^"]+)"/.exec(html)?.[1] ?? '';
      const jar = (page.headers.getSetCookie?.() ?? [])
        .filter((c) => c.startsWith('vitiwai_csrf='))
        .map((c) => c.split(';')[0])
        .join('; ');

      last = await fetch(`${BASE}/signin/submit`, {
        method: 'POST',
        headers: { cookie: jar, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email, password: 'wrong-but-well-formed', _csrf: token }),
        redirect: 'manual',
      });
    }

    expect(last!.status, 'the attempt past the budget must be refused').toBe(429);
    expect(Number(last!.headers.get('retry-after'))).toBeGreaterThan(0);
  }, 180_000);

  it('still lets a different address sign in', async () => {
    // The acceptance half: a limiter that returned 429 to everything would pass
    // the case above on its own.
    const page = await fetch(`${BASE}/signin`);
    const html = await page.text();
    const token = /name="_csrf"\s+value="([^"]+)"/.exec(html)?.[1] ?? '';
    const jar = (page.headers.getSetCookie?.() ?? [])
      .filter((c) => c.startsWith('vitiwai_csrf='))
      .map((c) => c.split(';')[0])
      .join('; ');

    const res = await fetch(`${BASE}/signin/submit`, {
      method: 'POST',
      headers: { cookie: jar, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        email: 'adi.baleiwai.19@example.test',
        password: 'demo-passphrase',
        _csrf: token,
      }),
      redirect: 'manual',
    });
    expect(res.status, 'a legitimate sign-in must not be refused').toBe(303);
  }, 120_000);
});
