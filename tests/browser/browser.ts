import { chromium, type Browser, type Page } from 'playwright';
import { clearSignInBudget } from '../contract/portal';

/**
 * A real browser, for the claims jsdom cannot decide.
 *
 * The contract suite already renders every route into jsdom and runs axe over
 * it. That catches a great deal and is fast, but jsdom has no layout engine, so
 * three of the things an accessibility claim is usually about - colour
 * contrast, target size, element height - are computed style it cannot compute.
 * `tests/contract/axe.test.ts` says so in its own header: `color-contrast`
 * returns `incomplete` and `target-size` never runs at all.
 *
 * This project answers those by painting the page. It does not replace the
 * jsdom suite; it covers what that suite is honest about not covering.
 *
 * It is a separate Vitest project because it needs a built application and a
 * browser binary, and `npm test` should not wait for either.
 */

const PORT = process.env.PORT_PORTAL ?? '3000';
export const BASE = `http://localhost:${PORT}`;

/** Every route a customer can look at, and whether it needs a session. */
export const PUBLIC_ROUTES = ['/', '/plans', '/join', '/signin'] as const;
export const ACCOUNT_ROUTES = [
  '/account',
  '/account/pay',
  '/account/support',
  '/account/change-plan',
] as const;
export const ALL_ROUTES = [...PUBLIC_ROUTES, ...ACCOUNT_ROUTES] as const;

/*
 * The account these journeys drive.
 *
 * Overridable by the same two variables `scripts/demo-credential.mjs` reads, so
 * a run can be pointed at a different seeded customer without editing a test.
 * That matters for the payment journey: paying the bill consumes it, the seed
 * is idempotent and issues no replacement, so the only way to exercise the
 * submission again is a customer who still owes something.
 */
export const DEMO_EMAIL = process.env.DEMO_EMAIL ?? 'adi.baleiwai.19@example.test';
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'demo-passphrase';

/** The narrowest width worth supporting. Below this, nothing is designed for. */
export const NARROW = { width: 320, height: 640 };
export const DESKTOP = { width: 1280, height: 900 };

export async function portalIsUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/`, { redirect: 'manual' });
    return res.status < 500;
  } catch {
    return false;
  }
}

export async function requirePortal(): Promise<void> {
  if (!(await portalIsUp())) {
    throw new Error(
      `the portal is not answering at ${BASE}. Run \`npm run build && npm start\` first.`,
    );
  }
}

export async function launch(): Promise<Browser> {
  // No sandbox flags and no custom args: the point of this project is to
  // measure what a customer's browser does, and every flag is a way for the
  // measurement to stop describing that.
  return chromium.launch();
}

/**
 * Signs in through the form, using the keyboard only.
 *
 * Deliberately not a cookie injected from the contract helper. A session
 * obtained by posting to `/signin/submit` proves the handler works; a session
 * obtained by tabbing to the fields and pressing Enter proves a customer with
 * no mouse can get one. Those are different claims and this project makes the
 * second.
 */
export async function signInWithKeyboard(
  page: Page,
  email = DEMO_EMAIL,
  password = DEMO_PASSWORD,
): Promise<void> {
  // The harness signs in as the same seeded account from every file, which to
  // the rate limiter is indistinguishable from credential stuffing against one
  // email. Clearing this account's own budget is the harness admitting it is a
  // harness; the limiter itself is proved in tests/contract/ratelimit.test.ts.
  await clearSignInBudget(email);

  await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle' });

  // Tab until the focused element is the email field, rather than assuming a
  // tab count. A layout change that adds a link before the form would silently
  // break a fixed count while the page remained perfectly usable.
  await focusBySelector(page, 'input[name="email"]');
  await page.keyboard.type(email);
  await page.keyboard.press('Tab');
  await page.keyboard.type(password);
  await page.keyboard.press('Enter');

  await page.waitForURL((url) => !url.pathname.startsWith('/signin'), { timeout: 30_000 });
}

/**
 * Moves focus to `selector` using Tab alone, and fails if it cannot be reached.
 *
 * This is the whole keyboard claim in one function: an element that cannot be
 * focused by tabbing is unreachable without a mouse, whatever it looks like.
 */
export async function focusBySelector(page: Page, selector: string, limit = 40): Promise<void> {
  await page.locator(selector).waitFor({ state: 'visible', timeout: 15_000 });
  for (let i = 0; i < limit; i += 1) {
    const onTarget = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return !!el && document.activeElement === el;
    }, selector);
    if (onTarget) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`could not reach ${selector} with ${limit} presses of Tab`);
}

/** Types into a field reached by keyboard, never by clicking it. */
export async function typeInto(page: Page, selector: string, value: string): Promise<void> {
  await focusBySelector(page, selector);
  await page.keyboard.type(value);
}

/**
 * Submits by pressing Enter on the submit control, reached by Tab.
 *
 * Scoped to `main` by default. The header carries a sign-out button that is
 * also `type="submit"`, so the unscoped selector matches two controls on every
 * signed-in page - and the first match is the one that ends the session, which
 * makes every journey test log itself out instead of submitting its form.
 */
export async function submitByKeyboard(page: Page, selector = 'main button[type="submit"]') {
  await focusBySelector(page, selector);
  await page.keyboard.press('Enter');
}

/**
 * Submits, then waits for the page that results.
 *
 * Pressing Enter starts a navigation, and anything evaluated in the page while
 * that navigation is in flight fails with "Execution context was destroyed".
 * Waiting afterwards is not enough: `waitForLoadState` can resolve against the
 * document being replaced, so the next `evaluate` lands in the gap.
 *
 * The wait is therefore armed *before* the key is pressed, which is the only
 * ordering with no window between the two.
 */
export async function submitAndWait(
  page: Page,
  selector = 'main button[type="submit"]',
): Promise<void> {
  const navigated = page
    .waitForEvent('framenavigated', { timeout: 30_000 })
    .catch(() => null);
  await submitByKeyboard(page, selector);
  await navigated;
  // Settle. A handler that redirects produces two navigations, and the second
  // is the one carrying the page a customer reads.
  await page.waitForLoadState('networkidle').catch(() => undefined);
}
