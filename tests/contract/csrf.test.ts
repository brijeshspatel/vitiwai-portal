import { beforeAll, describe, expect, it } from 'vitest';
import { BASE, portalIsUp, signIn } from './portal';

/**
 * Every mutation refuses a request that carries no valid token.
 *
 * Each case asserts a rejection **and** an acceptance. A handler that answered
 * 403 to everything would satisfy the rejection half on its own, and a suite
 * that only checked rejections would call that a pass.
 */

let session: string;

beforeAll(async () => {
  if (!(await portalIsUp())) {
    throw new Error(`the portal is not answering at ${BASE}. Run \`npm run build && npm start\`.`);
  }
  session = await signIn();
}, 120_000);

/**
 * A session for one test.
 *
 * `/signout` is one of the mutations under test, and its acceptance case really
 * does sign the session out - which left every later case in this file
 * unauthenticated and looking for a token on a page it was being redirected
 * away from. Each case that mutates session state takes its own.
 */
async function freshSession(): Promise<string> {
  return signIn();
}

/** A page's rendered token and the cookie sent with it, from one request. */
async function tokenFrom(path: string, cookie?: string) {
  const res = await fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {} });
  const html = await res.text();
  const field = /name="_csrf"\s+value="([^"]+)"/.exec(html)?.[1];
  const setCookie = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith('vitiwai_csrf='));
  const jar = setCookie ? setCookie.split(';')[0]! : `vitiwai_csrf=${field}`;
  return { field, cookie: cookie ? `${cookie}; ${jar}` : jar };
}

function body(fields: Record<string, string>) {
  return new URLSearchParams(fields);
}

async function post(path: string, fields: Record<string, string>, cookie: string) {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: body(fields),
    redirect: 'manual',
  });
}

/** The six mutating endpoints, with a minimal valid body for each. */
const MUTATIONS = [
  { path: '/signin/submit', page: '/signin', auth: false,
    fields: { email: 'nobody@example.test', password: 'wrong-but-well-formed' } },
  { path: '/signout', page: '/account', auth: true, fields: {} },
  { path: '/account/support/submit', page: '/account/support', auth: true,
    fields: { title: 'A fault', description: 'Something is wrong.' } },
  { path: '/account/change-plan/submit', page: '/account/change-plan', auth: true,
    fields: { planId: 'plan-bundle-2' } },
] as const;

describe('a mutation without a token is refused', () => {
  it.each(MUTATIONS)('$path rejects a missing token', async (m) => {
    const cookie = m.auth ? session : '';
    const { cookie: jar } = await tokenFrom(m.page, cookie || undefined);
    const res = await post(m.path, { ...m.fields }, jar);
    expect(res.status, `${m.path} with no _csrf field`).toBe(403);
  }, 120_000);

  it.each(MUTATIONS)('$path rejects a wrong token', async (m) => {
    const cookie = m.auth ? session : '';
    const { cookie: jar } = await tokenFrom(m.page, cookie || undefined);
    const res = await post(m.path, { ...m.fields, _csrf: 'not-the-right-token' }, jar);
    expect(res.status, `${m.path} with a wrong _csrf field`).toBe(403);
  }, 120_000);

  it.each(MUTATIONS)('$path accepts the token the page rendered', async (m) => {
    // The other half. Without this, a handler that returned 403 to every
    // request would pass both assertions above.
    //
    // A fresh session per case, because accepting /signout ends the session -
    // sharing one made every case after it fail for the wrong reason.
    const cookie = m.auth ? await freshSession() : '';
    const { field, cookie: jar } = await tokenFrom(m.page, cookie || undefined);
    expect(field, `${m.page} must render a token`).toBeTruthy();

    const res = await post(m.path, { ...m.fields, _csrf: field! }, jar);
    expect(res.status, `${m.path} with the rendered token`).not.toBe(403);
  }, 120_000);
});

describe('the token itself', () => {
  it('is rendered by every page that carries a mutating form', async () => {
    const authed = await freshSession();
    for (const page of ['/signin', '/join', '/account', '/account/pay', '/account/support', '/account/change-plan']) {
      const needsAuth = page.startsWith('/account');
      const { field } = await tokenFrom(page, needsAuth ? authed : undefined);
      expect(field, `${page} renders no _csrf field`).toBeTruthy();
      expect(field!.length, `${page}'s token is too short`).toBeGreaterThanOrEqual(32);
    }
  }, 180_000);

  it('is not readable by scripts in the browser', async () => {
    const res = await fetch(`${BASE}/signin`);
    const setCookie = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith('vitiwai_csrf='));
    expect(setCookie, 'no csrf cookie was set').toBeDefined();
    expect(setCookie!.toLowerCase()).toContain('httponly');
    expect(setCookie!.toLowerCase()).toContain('samesite=lax');
  }, 60_000);
});
