/**
 * Helpers for the tests that look at the portal the way a browser does.
 *
 * These fetch rendered HTML from a running `next start` rather than rendering
 * components in isolation, because the defects this run fixes were all invisible
 * to component tests: a dead link in the layout, a stylesheet rule scoped to one
 * component, and a table row whose height depends on its data.
 */

import { JSDOM } from 'jsdom';

const PORT = process.env.PORT_PORTAL ?? '3000';
export const BASE = `http://localhost:${PORT}`;

/** Every route a customer can actually look at. */
export const PUBLIC_ROUTES = ['/', '/plans', '/join', '/signin'] as const;
export const ACCOUNT_ROUTES = [
  '/account',
  '/account/pay',
  '/account/support',
  '/account/change-plan',
] as const;

export async function portalIsUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/`, { redirect: 'manual' });
    return res.status < 500;
  } catch {
    return false;
  }
}

/**
 * Signs in and returns the cookie header.
 *
 * The credential is created by `npm run demo:credential`, which the contract
 * job runs, and belongs to a synthetic seeded customer.
 */
export async function signIn(
  email = 'adi.baleiwai.19@example.test',
  password = 'demo-passphrase',
): Promise<string> {
  // Sign-in is a mutation, so it carries a CSRF token like any other. The page
  // is fetched first to obtain the pair: the token it renders, and the cookie
  // set alongside it. Before increment 1E this helper posted without one, and
  // adding the guard made every signing-in contract test fail at once - which
  // is the guard working, not a defect.
  const page = await fetch(`${BASE}/signin`);
  const html = await page.text();
  const token = /name="_csrf"\s+value="([^"]+)"/.exec(html)?.[1] ?? '';
  const csrfCookie = (page.headers.getSetCookie?.() ?? [])
    .filter((c) => c.startsWith('vitiwai_csrf='))
    .map((c) => c.split(';')[0])
    .join('; ');

  const res = await fetch(`${BASE}/signin/submit`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(csrfCookie ? { cookie: csrfCookie } : {}),
    },
    body: new URLSearchParams({ email, password, _csrf: token }),
    redirect: 'manual',
  });
  const raw = res.headers.getSetCookie?.() ?? [];
  const cookie = raw.map((c) => c.split(';')[0]).join('; ');
  if (!cookie.includes('vitiwai_session')) {
    throw new Error(`sign-in did not set a session cookie (status ${res.status})`);
  }
  return cookie;
}

export async function getHtml(path: string, cookie?: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: 'manual',
  });
  if (res.status !== 200) throw new Error(`${path} returned ${res.status}, expected 200`);
  return res.text();
}

/**
 * Completes React's Suspense swap, which jsdom will not do for us.
 *
 * A streamed route sends its slow content at the end of `body`, inside
 * `<div hidden id="S:0">`, with `<template id="B:0">` marking where it belongs.
 * In a browser a small inline script moves it; jsdom runs no such script, so
 * `/plans` appears to have no `h1` inside `main` when it plainly does - the
 * heading is simply still sitting in the holder.
 *
 * This performs the same move. It was checked against the settled DOM of a real
 * Chrome tab on the same build: 1 `h1` inside `main`, 12 plan headings, and zero
 * holders left over. Without that comparison this would be a guess about
 * someone else's protocol.
 */
export function settleSuspense(document: Document): number {
  let moved = 0;
  // Two passes are not enough in general: a holder's content can itself contain
  // the placeholder for a later one, so this repeats until nothing more moves.
  // The bound stops a malformed document spinning.
  for (let pass = 0; pass < 20; pass += 1) {
    let movedThisPass = 0;
    for (const holder of [...document.querySelectorAll('body > div[id^="S:"]')]) {
      const slot = holder.id.slice(2);
      // React marks the destination with `B:` for a boundary and `P:` for
      // postponed content. Matching only `B:` leaves the second kind behind,
      // which is what made `/plans` look as though it had no `h1` in `main`.
      const target =
        document.getElementById(`B:${slot}`) ?? document.getElementById(`P:${slot}`);
      if (!target?.parentNode) continue;
      while (holder.firstChild) target.parentNode.insertBefore(holder.firstChild, target);
      target.remove();
      holder.remove();
      movedThisPass += 1;
    }
    moved += movedThisPass;
    if (movedThisPass === 0) break;
  }
  return moved;
}

/**
 * Loads rendered HTML into jsdom with the real stylesheet inlined.
 *
 * The stylesheet must be fetched and inlined rather than linked: jsdom does not
 * load external resources by default, and a document without the stylesheet
 * would report every element as unstyled - which would make a styling check
 * pass or fail for the wrong reason.
 */
export async function domFor(
  path: string,
  cookie?: string,
  width = 1280,
): Promise<{ dom: JSDOM; window: JSDOM['window'] }> {
  const html = await getHtml(path, cookie);
  const css = await allStylesheets(html);
  const withCss = html.replace('</head>', `<style>${css}</style></head>`);
  const dom = new JSDOM(withCss, {
    url: `${BASE}${path}`,
    pretendToBeVisual: true,
    // `outside-only` lets this file call `window.eval` (axe needs it) without
    // executing the page's own scripts. The Suspense swap those scripts would
    // perform is done explicitly by `settleSuspense`, which is deterministic;
    // running the page's scripts as well completed it only partially and left
    // the result depending on load order.
    runScripts: 'outside-only',
    // jsdom has no layout engine, so this only affects media queries and the
    // reported viewport. Anything needing real geometry is checked elsewhere.
    beforeParse(w) {
      Object.defineProperty(w, 'innerWidth', { value: width, configurable: true });
      Object.defineProperty(w, 'innerHeight', { value: 800, configurable: true });
    },
  });
  settleSuspense(dom.window.document);
  return { dom, window: dom.window };
}

/** Fetches and concatenates every stylesheet the document links. */
export async function allStylesheets(html: string): Promise<string> {
  const hrefs = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(
    (m) => m[1]!,
  );
  const parts = await Promise.all(
    hrefs.map(async (h) => {
      const res = await fetch(h.startsWith('http') ? h : `${BASE}${h}`);
      return res.ok ? res.text() : '';
    }),
  );
  return parts.join('\n');
}

/** The stylesheet of the running application, as text. */
export async function stylesheetText(): Promise<string> {
  return allStylesheets(await getHtml('/'));
}
