import { beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNT_ROUTES, BASE, domFor, portalIsUp, PUBLIC_ROUTES, signIn } from './portal';

/**
 * The navigation, checked the way the defect was found.
 *
 * `/support` returned 404 from every page of the site from increment 1A until
 * increment 1D. No component test saw it, because no component test asked
 * whether the href resolved.
 */

let cookie: string;

beforeAll(async () => {
  if (!(await portalIsUp())) {
    throw new Error(`the portal is not answering at ${BASE}. Run \`npm run build && npm start\`.`);
  }
  cookie = await signIn();
}, 120_000);

async function navLinks(path: string, withCookie?: string) {
  const { window, dom } = await domFor(path, withCookie);
  const nav = window.document.querySelector('nav[aria-label="Main"]');
  const links = [...(nav?.querySelectorAll('a') ?? [])].map((a) => ({
    label: a.textContent!.trim(),
    href: a.getAttribute('href')!,
  }));
  const buttons = [...(nav?.querySelectorAll('button') ?? [])].map((b) => b.textContent!.trim());
  dom.window.close();
  return { links, buttons };
}

describe('every navigation link resolves', () => {
  it.each([...PUBLIC_ROUTES])('from %s', async (path) => {
    const { links } = await navLinks(path);

    // Without this the test would pass on a page that rendered no navigation
    // at all, which is exactly the shape of failure it exists to catch.
    expect(links.length).toBeGreaterThanOrEqual(4);

    for (const link of links) {
      const res = await fetch(`${BASE}${link.href}`, { redirect: 'manual' });
      expect(
        res.status,
        `navigation link "${link.label}" -> ${link.href} returned ${res.status}`,
      ).not.toBe(404);
    }
  }, 120_000);

  it('offers no label twice with different destinations', async () => {
    const { links } = await navLinks('/');
    const byLabel = new Map<string, Set<string>>();
    for (const l of links) {
      if (!byLabel.has(l.label)) byLabel.set(l.label, new Set());
      byLabel.get(l.label)!.add(l.href);
    }
    const ambiguous = [...byLabel].filter(([, hrefs]) => hrefs.size > 1);
    expect(ambiguous).toEqual([]);
  }, 60_000);
});

describe('the navigation reflects the session', () => {
  it('offers sign-in, and no sign-out, when signed out', async () => {
    const { links, buttons } = await navLinks('/');
    const labels = links.map((l) => l.label);
    expect(labels).toContain('Sign in');
    expect(labels).toContain('Open an account');
    expect([...labels, ...buttons]).not.toContain('Sign out');
    expect(labels).not.toContain('My account');
  }, 60_000);

  it('offers sign-out, and no sign-in, when signed in', async () => {
    const { links, buttons } = await navLinks('/account', cookie);
    const labels = links.map((l) => l.label);
    expect(buttons).toContain('Sign out');
    expect(labels).toContain('My account');
    expect(labels).not.toContain('Sign in');
  }, 60_000);

  it('signs out by POST, never by a link', async () => {
    const { window, dom } = await domFor('/account', cookie);
    const form = window.document.querySelector('nav[aria-label="Main"] form');
    expect(form, 'sign-out must be a form inside the navigation').not.toBeNull();
    expect(form!.getAttribute('method')!.toLowerCase()).toBe('post');
    expect(form!.getAttribute('action')).toBe('/signout');
    // A GET on the sign-out route must not work, or a prefetch could sign the
    // customer out without them asking.
    const viaGet = await fetch(`${BASE}/signout`, { redirect: 'manual' });
    expect(viaGet.status).toBe(405);
    dom.window.close();
  }, 60_000);

  it('keeps the account routes reachable while signed in', async () => {
    for (const path of ACCOUNT_ROUTES) {
      const res = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: 'manual' });
      expect(res.status, `${path} while signed in`).toBe(200);
    }
  }, 120_000);
});
