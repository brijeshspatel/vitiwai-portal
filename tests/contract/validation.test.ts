import { beforeAll, describe, expect, it } from 'vitest';
import { BASE, portalIsUp, signIn } from './portal';

/**
 * Malformed input is refused before a handler acts on it.
 *
 * Every case sends a valid CSRF token, so a rejection here is the schema's
 * doing and not the forgery guard's. Without that, a 403 from the token check
 * would look like validation working.
 */

beforeAll(async () => {
  if (!(await portalIsUp())) {
    throw new Error(`the portal is not answering at ${BASE}. Run \`npm run build && npm start\`.`);
  }
}, 120_000);

async function tokenFor(page: string, session?: string) {
  const res = await fetch(`${BASE}${page}`, { headers: session ? { cookie: session } : {} });
  const html = await res.text();
  const field = /name="_csrf"\s+value="([^"]+)"/.exec(html)?.[1] ?? '';
  const set = (res.headers.getSetCookie?.() ?? [])
    .filter((c) => c.startsWith('vitiwai_csrf='))
    .map((c) => c.split(';')[0])
    .join('; ');
  const jar = [session, set || `vitiwai_csrf=${field}`].filter(Boolean).join('; ');
  return { field, jar };
}

async function post(path: string, fields: Record<string, string>, jar: string) {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { cookie: jar, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
    redirect: 'manual',
  });
}

describe('the payment handler', () => {
  it('refuses a fractional amount, and accepts an integer one', async () => {
    const session = await signIn();
    const { field, jar } = await tokenFor('/account/pay', session);

    const bad = await post('/account/pay/submit', {
      _csrf: field, invoiceId: '1', amountMinor: '22.50',
      instrument: 'pm_test_ok', idempotencyKey: `k-${Date.now()}`,
    }, jar);
    expect(bad.status, 'a fractional amount must not 403 - that would be the token check').toBe(303);
    expect(bad.headers.get('location')).toMatch(/outcome=unavailable/);

    // The acceptance half: a well-formed request reaches the payment path and
    // is answered on its merits, not rejected by validation.
    const good = await post('/account/pay/submit', {
      _csrf: field, invoiceId: '1', amountMinor: '2250',
      instrument: 'pm_test_ok', idempotencyKey: `k-${Date.now()}-ok`,
    }, jar);
    expect(good.status).toBe(303);
    expect(good.headers.get('location')).not.toMatch(/That payment request was not valid/);
  }, 180_000);

  it('refuses an instrument the gateway does not understand', async () => {
    const session = await signIn();
    const { field, jar } = await tokenFor('/account/pay', session);
    const res = await post('/account/pay/submit', {
      _csrf: field, invoiceId: '1', amountMinor: '2250',
      instrument: 'pm_live_visa', idempotencyKey: `k-${Date.now()}`,
    }, jar);
    expect(res.headers.get('location')).toMatch(/outcome=unavailable/);
  }, 180_000);
});

describe('the support handler', () => {
  it('refuses an empty report and accepts a real one', async () => {
    const session = await signIn();
    const { field, jar } = await tokenFor('/account/support', session);

    const bad = await post('/account/support/submit', { _csrf: field, title: '   ', description: 'x' }, jar);
    expect(bad.status).toBe(303);
    expect(bad.headers.get('location')).toMatch(/error=/);

    const good = await post('/account/support/submit',
      { _csrf: field, title: 'No water since Tuesday', description: 'Supply stopped at the meter.' }, jar);
    expect(good.headers.get('location'), 'a valid report must not be refused').not.toMatch(/error=/);
  }, 180_000);
});

describe('the plan-change handler', () => {
  it('refuses a missing plan and accepts a chosen one', async () => {
    const session = await signIn();
    const { field, jar } = await tokenFor('/account/change-plan', session);

    const bad = await post('/account/change-plan/submit', { _csrf: field, planId: '' }, jar);
    expect(bad.headers.get('location')).toMatch(/error=/);

    const good = await post('/account/change-plan/submit', { _csrf: field, planId: 'plan-bundle-2' }, jar);
    expect(good.headers.get('location'), 'a valid request must not be refused').not.toMatch(/error=/);
  }, 180_000);
});

describe('the onboarding handler', () => {
  it('refuses a malformed date rather than passing it on', async () => {
    const { field, jar } = await tokenFor('/join');
    const res = await post('/join/submit', {
      _csrf: field, fullName: 'ANA MEREANI NAIQAMA', dateOfBirth: '14 March 1991',
      documentNumber: 'FJ7481239', email: 'ana@example.test', password: 'a-long-enough-passphrase',
    }, jar);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toMatch(/error=/);
  }, 180_000);
});
