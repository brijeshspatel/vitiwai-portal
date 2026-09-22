import { beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNT_ROUTES, BASE, domFor, portalIsUp, PUBLIC_ROUTES, signIn } from './portal';

/**
 * The application shell's accessibility floor.
 *
 * These five assertions used to render RootLayout with Testing Library. Once the
 * layout gained an async server component that reads the session, a synchronous
 * render produced an empty container, so they were moved here rather than
 * weakened. They now read the HTML the server actually sends, on every route
 * instead of on one synthetic render.
 */

let cookie: string;

beforeAll(async () => {
  if (!(await portalIsUp())) {
    throw new Error(`the portal is not answering at ${BASE}. Run \`npm run build && npm start\`.`);
  }
  cookie = await signIn();
}, 120_000);

async function eachRoute(): Promise<[string, string | undefined][]> {
  return [
    ...PUBLIC_ROUTES.map((r) => [r, undefined] as [string, undefined]),
    ...ACCOUNT_ROUTES.map((r) => [r, cookie] as [string, string]),
  ];
}

describe('the application shell meets the accessibility floor, on every route', () => {
  it('declares the document language', async () => {
    for (const [path, c] of await eachRoute()) {
      const { window, dom } = await domFor(path, c);
      expect(window.document.documentElement.getAttribute('lang'), path).toBe('en-FJ');
      dom.window.close();
    }
  }, 180_000);

  it('renders exactly one main landmark, with the page heading inside it', async () => {
    for (const [path, c] of await eachRoute()) {
      const { window, dom } = await domFor(path, c);
      const mains = window.document.querySelectorAll('main');
      expect(mains, path).toHaveLength(1);
      const h1 = mains[0]!.querySelectorAll('h1');
      expect(h1.length, `${path} must have exactly one h1 inside main`).toBe(1);
      dom.window.close();
    }
  }, 180_000);

  it('puts a skip link first, and its target exists', async () => {
    for (const [path, c] of await eachRoute()) {
      const { window, dom } = await domFor(path, c);
      const skip = window.document.querySelector('a.vw-skip-link');
      expect(skip?.getAttribute('href'), path).toBe('#main');
      // A skip link pointing at nothing is worse than none: it moves focus
      // somewhere the user cannot see.
      expect(window.document.querySelector('#main'), `${path} skip target`).not.toBeNull();
      dom.window.close();
    }
  }, 180_000);

  it('names its navigation, so two navs would still be distinguishable', async () => {
    for (const [path, c] of await eachRoute()) {
      const { window, dom } = await domFor(path, c);
      const navs = window.document.querySelectorAll('nav');
      expect(navs.length, `${path} nav count`).toBe(1);
      expect(navs[0]!.getAttribute('aria-label'), path).toBe('Main');
      dom.window.close();
    }
  }, 180_000);

  it('states on every page that the data is synthetic', async () => {
    for (const [path, c] of await eachRoute()) {
      const { window, dom } = await domFor(path, c);
      expect(window.document.querySelector('footer')?.textContent, path).toMatch(/synthetic/i);
      dom.window.close();
    }
  }, 180_000);
});
