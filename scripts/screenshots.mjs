#!/usr/bin/env node
/**
 * Captures the screenshot set published under screenshots/.
 *
 * Scripted rather than taken by hand for three reasons: the viewport is exact
 * and stated, the set can be regenerated when the interface changes, and nobody
 * has to remember which pages were covered. Re-run it and the images are
 * replaced; a page that has regressed shows up in the diff.
 *
 * Needs a portal already running. Start one with:
 *
 *   npm run build && npm start
 *
 * DEVELOPMENT ONLY. Every figure in these images comes from synthetic data.
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { loadEnvFile } from './lib/env-file.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
loadEnvFile(root);

const BASE = `http://localhost:${process.env.PORT_PORTAL ?? 3000}`;
const OUT = join(root, 'screenshots');

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

const EMAIL = 'adi.baleiwai.19@example.test';
const PASSWORD = 'demo-passphrase';

/**
 * The set. `full` captures the whole scrollable page rather than the fold,
 * which is what a reader wants from a screenshot of a form or a table.
 */
const SHOTS = [
  { file: '01-home', path: '/', title: 'Home', auth: false, full: true },
  { file: '02-plans', path: '/plans', title: 'Plans, unfiltered', auth: false, full: true },
  {
    file: '03-plans-filtered',
    path: '/plans?category=broadband&maxPrice=120',
    title: 'Plans, filtered to broadband under FJ$120',
    auth: false,
    full: true,
  },
  { file: '04-join', path: '/join', title: 'Opening an account', auth: false, full: true },
  { file: '05-signin', path: '/signin', title: 'Signing in', auth: false, full: true },
  { file: '06-account', path: '/account', title: 'The account dashboard', auth: true, full: true },
  { file: '07-pay', path: '/account/pay', title: 'Paying a bill', auth: true, full: true },
  {
    file: '08-support',
    path: '/account/support',
    title: 'Reporting a fault, and the cases already open',
    auth: true,
    full: true,
  },
  {
    file: '09-change-plan',
    path: '/account/change-plan',
    title: 'Asking to change plan',
    auth: true,
    full: true,
  },
  { file: '10-not-found', path: '/no-such-page', title: 'A page that does not exist', auth: false },
];

const PHONE_SHOTS = [
  { file: '11-phone-home', path: '/', title: 'Home on a phone', auth: false, full: true },
  {
    file: '12-phone-menu',
    path: '/',
    title: 'The menu open on a phone',
    auth: true,
    openMenu: true,
  },
  {
    file: '13-phone-account',
    path: '/account',
    title: 'The dashboard on a phone',
    auth: true,
    full: true,
  },
  { file: '14-phone-plans', path: '/plans', title: 'Plans on a phone', auth: false, full: true },
];

async function signedInContext(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle' });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await Promise.all([page.waitForURL('**/account', { timeout: 30_000 }), page.click('button[type=submit]')]);
  await page.close();
  return context;
}

async function capture(context, shot, viewport) {
  const page = await context.newPage();
  await page.goto(`${BASE}${shot.path}`, { waitUntil: 'networkidle' });

  // Suspense boundaries stream in. Waiting for the fallback to disappear is the
  // difference between a screenshot of the page and a screenshot of "Loading...".
  await page
    .waitForFunction(() => !document.body.textContent?.includes('Loading...'), null, {
      timeout: 20_000,
    })
    .catch(() => {});

  if (shot.openMenu) await page.click('summary.vw-nav__toggle');

  const file = join(OUT, `${shot.file}.png`);
  await page.screenshot({ path: file, fullPage: Boolean(shot.full) });
  await page.close();

  const label = `${viewport.width}x${viewport.height}`;
  console.log(`  ${shot.file}.png  ${label.padEnd(9)} ${shot.title}`);
  return { ...shot, viewport: label };
}

const browser = await chromium.launch();
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const taken = [];

console.log(`Desktop ${DESKTOP.width}x${DESKTOP.height}`);
const anon = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 2 });
const authed = await signedInContext(browser, DESKTOP);
for (const shot of SHOTS) {
  taken.push(await capture(shot.auth ? authed : anon, shot, DESKTOP));
}
await anon.close();
await authed.close();

console.log(`\nPhone ${PHONE.width}x${PHONE.height}`);
const anonPhone = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2 });
const authedPhone = await signedInContext(browser, PHONE);
for (const shot of PHONE_SHOTS) {
  taken.push(await capture(shot.auth ? authedPhone : anonPhone, shot, PHONE));
}
await anonPhone.close();
await authedPhone.close();
await browser.close();

// The index is generated with the images, so it cannot fall out of step with
// them the way a hand-written list would.
const rows = taken
  .map((s) => `| [\`${s.file}.png\`](${s.file}.png) | ${s.title} | ${s.viewport} |`)
  .join('\n');

await writeFile(
  join(OUT, 'README.md'),
  `# Screenshots

The Vitiwai Utilities customer portal, captured from the running application on
${new Date().toISOString().slice(0, 10)} at version ${(await import('node:fs')).readFileSync(join(root, 'VERSION'), 'utf8').trim()}.

**Every figure, name, address and invoice in these images is synthetic.** No real
person and no real money appears anywhere. Payment and identity verification are
simulated, and each is labelled as such on screen.

Regenerate with \`npm run build && npm start\`, then \`npm run screenshots\`. The
images and this index are written together, so the list cannot drift from what
was captured.

| Image | What it shows | Viewport |
|---|---|---|
${rows}

## What to look at

* **The navigation reflects the session.** Signed out it offers "Open an account"
  and "Sign in"; signed in it offers "My account", "Support" and "Sign out".
* **The usage table is a table**, not a picture of one. Every figure is readable
  as text, and the bars are decoration that assistive technology never sees.
* **Simulated capabilities are labelled** on the page the customer meets them on,
  not only in the documentation.
* **The phone layout is a layout**, not a squeezed desktop: the navigation
  becomes a menu, the grids stack, and the usage bars give way to the figures.
`,
  'utf8',
);

console.log(`\nPASS - ${taken.length} screenshots and an index written to screenshots/`);
