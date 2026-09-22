import { beforeAll, describe, expect, it } from 'vitest';
import { BASE, portalIsUp } from './portal';

/**
 * The onboarding form, submitted the way a browser submits it.
 *
 * Every other test of this workflow calls `applyForAccount` directly. That is
 * why nobody noticed for five increments that the form posted to `/join`, a
 * page, and that the App Router cannot serve a page and a route handler on one
 * path - so `POST /join` was a 404 and the account-opening workflow could not
 * be completed in a browser at all.
 *
 * These tests go through HTTP. A test that calls the function cannot fail for
 * the reason this workflow was broken.
 */

const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

beforeAll(async () => {
  if (!(await portalIsUp())) {
    throw new Error(`the portal is not answering at ${BASE}. Run \`npm run build && npm start\`.`);
  }
}, 120_000);

/**
 * A specimen document from the docgen fixture service, never a real one.
 *
 * The call shape matches tests/contract/onboarding.test.ts: a POST carrying the
 * person, not a GET with a query string. The first draft of this file guessed a
 * GET and got 404 from a service that was running perfectly well; the second
 * guessed quality 'good', and the service replied that it must be one of clean,
 * photo, smudged or illegible.
 */
const PERSON = {
  surname: 'NAIQAMA',
  givenNames: 'ANA MEREANI',
  dateOfBirth: '14 MAR 1991',
  documentNumber: 'FJ7481239',
};

async function specimen(quality: 'clean' | 'photo' | 'smudged' | 'illegible'): Promise<Blob> {
  const docgen = process.env.DOCGEN_URL ?? 'http://localhost:8092';
  const res = await fetch(`${docgen}/v1/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...PERSON, quality }),
  });
  if (!res.ok) throw new Error(`docgen returned ${res.status}; is the stack up?`);
  return new Blob([await res.arrayBuffer()], { type: 'image/png' });
}

async function submit(fields: Record<string, string>, file: Blob | null) {
  // The form is a mutation, so it carries a CSRF token. The page is fetched
  // first for the pair: the token it renders and the cookie set beside it.
  const page = await fetch(`${BASE}/join`);
  const html = await page.text();
  const token = /name="_csrf"\s+value="([^"]+)"/.exec(html)?.[1] ?? '';
  const jar = (page.headers.getSetCookie?.() ?? [])
    .filter((c) => c.startsWith('vitiwai_csrf='))
    .map((c) => c.split(';')[0])
    .join('; ');

  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append('_csrf', token);
  if (file) form.append('document', file, 'specimen.png');
  return fetch(`${BASE}/join/submit`, {
    method: 'POST',
    body: form,
    headers: jar ? { cookie: jar } : {},
    redirect: 'manual',
  });
}

describe('opening an account through the form', () => {
  it('accepts a complete submission and does not return 404', async () => {
    // The assertion that fails today. Before this boundary the form's action
    // was `/join`, which returns 404 for POST, so the workflow was unreachable.
    const res = await submit(
      {
        fullName: 'ANA MEREANI NAIQAMA',
        dateOfBirth: '1991-03-14',
        documentNumber: 'FJ7481239',
        email: `join-${unique()}@example.test`,
        password: 'a-long-enough-passphrase',
      },
      await specimen('clean'),
    );

    expect(res.status, 'the submit endpoint must exist').not.toBe(404);
    // A plain form post answers with a redirect to the outcome, so the back
    // button and a refresh cannot resubmit the application.
    expect([303, 302]).toContain(res.status);
    expect(res.headers.get('location')).toMatch(/\/join\?outcome=/);
  }, 180_000);

  it('tells the applicant when the document is missing, rather than failing', async () => {
    const res = await submit(
      {
        fullName: 'Adi Specimen',
        dateOfBirth: '1990-01-01',
        documentNumber: 'A0000001',
        email: `join-${unique()}@example.test`,
        password: 'a-long-enough-passphrase',
      },
      null,
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toMatch(/error=/);
  }, 180_000);

  it('renders a form whose action is a route that exists', async () => {
    // The defect in one assertion: the action must not point at a page.
    const html = await (await fetch(`${BASE}/join`)).text();
    const action = /<form[^>]+action="([^"]+)"/.exec(html)?.[1];
    expect(action, 'the join form must declare an action').toBeDefined();

    // The probe carries a body, because that is what decides the answer.
    // Measured 2026-09-22 against the broken state: `POST /join` with no body
    // returns 200 - Next renders the page - while the same POST carrying form
    // data returns 404. A bodyless probe therefore passes on exactly the
    // defect this test exists to catch.
    const probe = await fetch(`${BASE}${action}`, {
      method: 'POST',
      body: new FormData(),
      redirect: 'manual',
    });
    expect(probe.status, `POST ${action} with a body must not be 404`).not.toBe(404);
  }, 120_000);
});
