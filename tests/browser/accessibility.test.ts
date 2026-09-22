import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import {
  ACCOUNT_ROUTES,
  ALL_ROUTES,
  BASE,
  DESKTOP,
  NARROW,
  PUBLIC_ROUTES,
  launch,
  requirePortal,
  signInWithKeyboard,
} from './browser';

/**
 * WCAG 2.2 A and AA, decided by a browser rather than announced by one.
 *
 * `tests/contract/axe.test.ts` runs the same rule set in jsdom and states two
 * rules it cannot decide. This file is the other half: same tags, same routes,
 * a page that painted. Where they disagree, this one is the measurement.
 */

const require = createRequire(import.meta.url);
const AXE_PATH = require.resolve('axe-core/axe.min.js');

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Only these stop a build. A budget nobody can pass is a budget that gets deleted. */
const BLOCKING = new Set(['serious', 'critical']);

type Violation = {
  id: string;
  impact: string | null;
  help: string;
  nodes: { target: string[] }[];
};

let browser: Browser;
let session: Page;

beforeAll(async () => {
  await requirePortal();
  browser = await launch();
  session = await browser.newPage();
  await session.setViewportSize(DESKTOP);
  await signInWithKeyboard(session);
}, 180_000);

afterAll(async () => {
  await browser?.close();
});

async function analyse(page: Page): Promise<Violation[]> {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async (tags) => {
    // @ts-expect-error - axe is injected into the page, not imported here.
    const result = await window.axe.run(document, { runOnly: { type: 'tag', values: tags } });
    return result.violations.map((v: Violation) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => ({ target: n.target })),
    }));
  }, TAGS);
}

function describeViolations(route: string, violations: Violation[]): string {
  return violations
    .map((v) => `${route}  [${v.impact}] ${v.id}: ${v.help}\n      ${v.nodes.map((n) => n.target.join(' ')).join('\n      ')}`)
    .join('\n');
}

describe('axe, against a page that painted', () => {
  for (const route of ALL_ROUTES) {
    const needsSession = (ACCOUNT_ROUTES as readonly string[]).includes(route);

    it(`reports no serious or critical violation on ${route}`, async () => {
      const page = needsSession ? session : await browser.newPage();
      if (!needsSession) await page.setViewportSize(DESKTOP);
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });

      const violations = await analyse(page);
      const blocking = violations.filter((v) => BLOCKING.has(v.impact ?? ''));
      const advisory = violations.filter((v) => !BLOCKING.has(v.impact ?? ''));

      // Advisory findings are printed and do not fail. They are real and worth
      // seeing; failing on them would make the suite unrunnable and the first
      // person to meet it would delete the assertion rather than the finding.
      if (advisory.length > 0) {
        console.log(`[advisory]\n${describeViolations(route, advisory)}`);
      }
      if (blocking.length > 0) {
        console.error(`[blocking]\n${describeViolations(route, blocking)}`);
      }

      expect(blocking.map((v) => `${v.id} (${v.impact})`)).toEqual([]);

      if (!needsSession) await page.close();
    });
  }
});

describe('colour contrast, which jsdom returns as incomplete', () => {
  for (const route of PUBLIC_ROUTES) {
    it(`resolves every contrast check on ${route}`, async () => {
      const page = await browser.newPage();
      await page.setViewportSize(DESKTOP);
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await page.addScriptTag({ path: AXE_PATH });

      const outcome = await page.evaluate(async () => {
        // @ts-expect-error - injected.
        const r = await window.axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] } });
        return {
          violations: r.violations.length,
          incomplete: r.incomplete.length,
          passes: r.passes.length,
        };
      });

      // The point of the file. In jsdom this rule returns `incomplete` because
      // there is no computed colour to compare; here it must actually decide.
      expect(outcome.incomplete).toBe(0);
      expect(outcome.violations).toBe(0);
      expect(outcome.passes).toBeGreaterThan(0);

      await page.close();
    });
  }
});

describe('at 320px, the narrowest width worth supporting', () => {
  for (const route of ALL_ROUTES) {
    const needsSession = (ACCOUNT_ROUTES as readonly string[]).includes(route);

    it(`${route} does not scroll sideways`, async () => {
      const page = needsSession ? session : await browser.newPage();
      await page.setViewportSize(NARROW);
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });

      const { scrollWidth, innerWidth, widest } = await page.evaluate(() => {
        let widest = { tag: '', width: 0 };
        for (const el of Array.from(document.body.querySelectorAll('*'))) {
          const r = el.getBoundingClientRect();
          if (r.width > widest.width) {
            widest = { tag: `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`, width: Math.round(r.width) };
          }
        }
        return {
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          widest,
        };
      });

      // One pixel of tolerance: sub-pixel layout rounds up, and a page that
      // overflows by a rounding error is not the defect this is looking for.
      expect(
        scrollWidth,
        `${route} overflows by ${scrollWidth - innerWidth}px; widest element ${widest.tag} at ${widest.width}px`,
      ).toBeLessThanOrEqual(innerWidth + 1);

      if (needsSession) await page.setViewportSize(DESKTOP);
      else await page.close();
    });
  }
});

describe('every journey reachable from the keyboard alone', () => {
  it('signs in without a mouse', async () => {
    // signInWithKeyboard tabs to each field and presses Enter. It ran in
    // beforeAll, so reaching this line at all is the assertion; this restates
    // it so a reader of the report sees the claim named.
    const page = session;
    await page.goto(`${BASE}/account`, { waitUntil: 'networkidle' });
    expect(new URL(page.url()).pathname).toBe('/account');
  });

  it('reaches every interactive control on the account page by tabbing', async () => {
    const page = session;
    await page.setViewportSize(DESKTOP);
    await page.goto(`${BASE}/account`, { waitUntil: 'networkidle' });

    const interactive = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }).length,
    );

    // Tab through and collect what actually receives focus. An interactive
    // element that never becomes activeElement is unreachable without a mouse,
    // however well it renders.
    //
    // Identity is the element's index in the same query the count came from,
    // never its text. The account page carries two "Sign out" buttons - one in
    // the header, one in the body - and keying on tag plus text collapsed them
    // into one, so this reported 8 of 9 reachable and blamed the page for a
    // defect in the measurement.
    const reached = new Set<number>();
    for (let i = 0; i < interactive + 10; i += 1) {
      await page.keyboard.press('Tab');
      const index = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return -1;
        const all = Array.from(
          document.querySelectorAll(
            'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        return all.indexOf(el);
      });
      if (index >= 0) reached.add(index);
    }

    console.log(`[measured] /account: ${interactive} interactive elements, ${reached.size} reachable by Tab`);
    expect(reached.size).toBeGreaterThanOrEqual(interactive);
  });

  it('gives every focused control a visible focus indicator', async () => {
    const page = session;
    await page.goto(`${BASE}/plans`, { waitUntil: 'networkidle' });

    // A keyboard user who cannot see where focus is has keyboard access in
    // name only. jsdom cannot answer this at all: it needs computed style on a
    // focused element.
    const withoutIndicator: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      await page.keyboard.press('Tab');
      const problem = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        const hasOutline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
        const hasShadow = s.boxShadow !== 'none' && s.boxShadow !== '';
        const hasBorder = parseFloat(s.borderWidth || '0') > 0;
        if (hasOutline || hasShadow || hasBorder) return null;
        return `${el.tagName.toLowerCase()} "${(el.innerText ?? '').slice(0, 24)}"`;
      });
      if (problem) withoutIndicator.push(problem);
    }

    expect(withoutIndicator).toEqual([]);
  });
});
