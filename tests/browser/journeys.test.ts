import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import {
  BASE,
  DESKTOP,
  DEMO_EMAIL,
  DEMO_PASSWORD,
  launch,
  requirePortal,
  signInWithKeyboard,
  submitAndWait,
  submitByKeyboard,
  typeInto,
} from './browser';
import { clearSignInBudget } from '../contract/portal';
import { record } from './record';

/**
 * Every customer journey, driven through the form a customer sees.
 *
 * The contract suite calls the handler; this submits the form. They are not the
 * same claim, and the difference has already cost this repository once: `POST
 * /join` answered 404 for five increments while its handler had tests and
 * passed them. A page and a route handler cannot share a path in the App
 * Router, so the form posted into a route that did not exist - and nothing
 * noticed, because nothing had ever submitted it.
 *
 * Every journey here therefore starts at a URL a customer can type and ends at
 * a page a customer can read. No function beneath the form is called directly.
 */

let browser: Browser;

beforeAll(async () => {
  await requirePortal();
  browser = await launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

async function freshPage(): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewportSize(DESKTOP);
  return page;
}

async function text(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}

describe('signing in', () => {
  it('takes a customer from the form to their account', async () => {
    const page = await freshPage();
    await signInWithKeyboard(page);

    expect(new URL(page.url()).pathname).toBe('/account');
    expect(await text(page)).toContain('Sign out');

    await page.close();
  });

  it('refuses a wrong password and says so on the page', async () => {
    const page = await freshPage();
    await clearSignInBudget(DEMO_EMAIL);
    await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle' });

    await typeInto(page, 'input[name="email"]', DEMO_EMAIL);
    await typeInto(page, 'input[name="password"]', 'not-the-passphrase');
    await submitAndWait(page);

    // Still on sign-in, and the page says something. A redirect to /account
    // here would be an authentication hole that no unit test would catch,
    // because the unit under test would be the part that said no.
    expect(new URL(page.url()).pathname).toBe('/signin');
    const body = await text(page);
    expect(body.toLowerCase()).toMatch(/not|incorrect|check|wrong|again/);

    await page.close();
  });
});

describe('signing out', () => {
  it('ends the session and locks the account page again', async () => {
    const page = await freshPage();
    await signInWithKeyboard(page);

    // The header's own sign-out control, named explicitly: it is the one a
    // customer reaches from any page.
    await submitAndWait(page, 'button.vw-nav__signout');

    // Ask for the account page again. A sign-out that clears the visible state
    // but leaves the cookie valid looks identical from the page it lands on.
    await page.goto(`${BASE}/account`, { waitUntil: 'networkidle' });
    expect(new URL(page.url()).pathname).toBe('/signin');

    await page.close();
  });
});

describe('paying a bill', () => {
  /*
   * This journey consumes what it needs.
   *
   * Invoices come from Odoo, and paying the seeded one leaves the account with
   * nothing to pay - so the second run of this file meets a different page from
   * the first. An earlier version asserted on the form unconditionally and
   * passed alone, then failed in the full suite, which is the worst way for a
   * test to be wrong: it looked like a product defect and was a harness
   * assumption.
   *
   * Both states are real and both are asserted. Which one ran is recorded, so a
   * reader of the measurements can tell whether the submission path was
   * actually exercised on that run rather than inferring it from a green tick.
   * `npm run seed` restores an unpaid bill.
   */
  it('either pays the outstanding bill, or says there is none', async () => {
    const page = await freshPage();
    await signInWithKeyboard(page);
    await page.goto(`${BASE}/account/pay`, { waitUntil: 'networkidle' });

    const payable = (await page.locator('main button[type="submit"]').count()) > 0;
    record('journey', '/account/pay', { submissionExercised: payable ? 1 : 0 });

    if (!payable) {
      // Nothing outstanding. The page must say so plainly rather than render an
      // empty form, which is the failure this branch guards against.
      const body = await text(page);
      expect(body.toLowerCase()).toMatch(/nothing to pay|no unpaid/);
      await page.close();
      return;
    }

    // The instrument is a select of test values; the amount and invoice are
    // already on the form. Submitting is the whole point: this posts to
    // /account/pay/submit, which is a different path from the page.
    await submitAndWait(page);

    const after = await text(page);
    expect(after.toLowerCase()).toMatch(/paid|received|thank|receipt|success|declined|insufficient/);

    await page.close();
  });
});

describe('raising a support request', () => {
  it('accepts the form and confirms it on the page', async () => {
    const page = await freshPage();
    await signInWithKeyboard(page);
    await page.goto(`${BASE}/account/support`, { waitUntil: 'networkidle' });

    await typeInto(page, 'input[name="title"]', 'No water at the meter');
    await typeInto(
      page,
      'textarea[name="description"]',
      'The meter reads zero flow since this morning. Synthetic test request.',
    );
    await submitAndWait(page);

    const body = await text(page);
    expect(body.toLowerCase()).toMatch(/thank|received|raised|logged|reference|request/);

    await page.close();
  });
});

describe('changing a plan', () => {
  it('accepts a choice and confirms it', async () => {
    const page = await freshPage();
    await signInWithKeyboard(page);
    await page.goto(`${BASE}/account/change-plan`, { waitUntil: 'networkidle' });

    // Choose whatever the first selectable plan is, by keyboard. Which plan it
    // is does not matter; that a choice can be made and submitted does.
    const hasRadio = (await page.locator('input[type="radio"]').count()) > 0;
    if (hasRadio) {
      await page.locator('input[type="radio"]').first().focus();
      await page.keyboard.press('Space');
    } else {
      await page.locator('select[name="planId"]').focus();
      await page.keyboard.press('ArrowDown');
    }

    await submitAndWait(page);

    const body = await text(page);
    expect(body.toLowerCase()).toMatch(/thank|received|requested|change|plan/);

    await page.close();
  });
});

describe('joining', () => {
  it('submits the onboarding form rather than calling the code beneath it', async () => {
    const page = await freshPage();
    await page.goto(`${BASE}/join`, { waitUntil: 'networkidle' });

    const unique = Date.now();
    await typeInto(page, 'input[name="fullName"]', 'Test Applicant');
    await typeInto(page, 'input[name="dateOfBirth"]', '1990-01-01');
    await typeInto(page, 'input[name="documentNumber"]', `SYNTH-${unique}`);
    await typeInto(page, 'input[name="email"]', `synthetic.${unique}@example.test`);
    await typeInto(page, 'input[name="password"]', 'a-long-enough-passphrase');

    await submitAndWait(page);

    /*
     * The assertion that matters is that this is not a 404.
     *
     * POST /join returned 404 for five increments. Every handler test passed
     * throughout, because they called the function and never posted the form.
     * Whatever the outcome of the submission - accepted, referred, or refused
     * for a missing document - the page must be a page.
     */
    const body = await text(page);
    expect(body).not.toContain('404');
    expect(body).not.toMatch(/This page could not be found/i);
    expect(body.length).toBeGreaterThan(0);

    await page.close();
  });
});
