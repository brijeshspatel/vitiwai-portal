import { beforeAll, describe, expect, it } from 'vitest';
import { STATIC_SECURITY_HEADERS } from '@/security/headers';
import { ACCOUNT_ROUTES, BASE, portalIsUp, PUBLIC_ROUTES, signIn } from './portal';

/**
 * Every route sends every security header.
 *
 * The expectation comes from src/security/headers.ts rather than a second copy
 * of the list, so the module and the assertion cannot drift apart. A test that
 * writes out its own header names passes happily while the application stops
 * sending one of them.
 */

let session: string;

beforeAll(async () => {
  if (!(await portalIsUp())) {
    throw new Error(`the portal is not answering at ${BASE}. Run \`npm run build && npm start\`.`);
  }
  session = await signIn();
}, 120_000);

const ROUTES = [...PUBLIC_ROUTES, ...ACCOUNT_ROUTES];

async function headersFor(path: string) {
  const needsAuth = path.startsWith('/account');
  const res = await fetch(`${BASE}${path}`, {
    headers: needsAuth ? { cookie: session } : {},
    redirect: 'manual',
  });
  return res.headers;
}

describe('the Content-Security-Policy', () => {
  it.each(ROUTES)('%s sends a policy with a nonce and no unsafe-inline script source', async (path) => {
    const csp = (await headersFor(path)).get('content-security-policy');
    expect(csp, `${path} sends no policy`).toBeTruthy();

    const scriptSrc = csp!.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src'));
    expect(scriptSrc, `${path} declares no script-src`).toBeTruthy();
    expect(scriptSrc!, `${path} allows inline script`).not.toContain("'unsafe-inline'");
    expect(scriptSrc!, `${path} carries no nonce`).toMatch(/'nonce-[A-Za-z0-9+/=_-]+'/);
  }, 120_000);

  it('gives a different nonce to each request', async () => {
    // A fixed nonce is no better than unsafe-inline: anything that can read one
    // page can reuse it.
    const nonces = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      const csp = (await headersFor('/')).get('content-security-policy') ?? '';
      nonces.add(/'nonce-([^']+)'/.exec(csp)?.[1] ?? '');
    }
    expect(nonces.size, 'the nonce repeated across requests').toBe(5);
  }, 120_000);

  it('does not reuse the CSRF token as the nonce', async () => {
    const res = await fetch(`${BASE}/signin`);
    const csp = res.headers.get('content-security-policy') ?? '';
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1] ?? '';
    const token = /name="_csrf"\s+value="([^"]+)"/.exec(await res.text())?.[1] ?? '';
    expect(nonce).not.toBe('');
    expect(token).not.toBe('');
    expect(nonce, 'the policy header would leak the CSRF token').not.toBe(token);
  }, 60_000);
});

describe('the headers that do not vary', () => {
  it.each(ROUTES)('%s sends all of them', async (path) => {
    const headers = await headersFor(path);
    for (const [name, value] of STATIC_SECURITY_HEADERS) {
      expect(headers.get(name), `${path} is missing ${name}`).toBe(value);
    }
  }, 120_000);

  it('asserts more than nothing', async () => {
    // Guards the loops above: an empty list would make every case vacuous.
    expect(STATIC_SECURITY_HEADERS.length).toBeGreaterThanOrEqual(4);
    expect(ROUTES.length).toBeGreaterThanOrEqual(8);
  });
});
