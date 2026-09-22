import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { BASE, DESKTOP, PUBLIC_ROUTES, launch, requirePortal } from './browser';
import { record, startRecording } from './record';

/**
 * Four budgets, each measured from the thing that defines it.
 *
 * Lighthouse would report the same four numbers and is not a dependency here.
 * It is a wrapper over the DevTools protocol, which Playwright already exposes,
 * so adding it would mean a new dependency to obtain values already reachable.
 *
 * These are the only timing assertions in the repository. The two that used to
 * live in the contract suite asserted wall-clock elapsed on a shared machine,
 * which measured the machine; these measure a page that painted, where the
 * number describes the product.
 */

const BUDGET = {
  /** Largest Contentful Paint. The moment the page looks loaded. */
  lcpMs: 2_500,
  /** Cumulative Layout Shift. Content moving under a reader's eye. */
  cls: 0.1,
  /** Total Blocking Time. Main thread unavailable to respond. */
  tbtMs: 200,
  /** First-load JavaScript, transferred. */
  jsKib: 200,
};

let browser: Browser;

beforeAll(async () => {
  await requirePortal();
  startRecording();
  browser = await launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

type Shift = { value: number; at: number; sources: string[] };
type Vitals = { lcp: number; cls: number; tbt: number; shifts: Shift[] };

async function measure(page: Page, route: string): Promise<Vitals> {
  // Observers are installed before navigation. An observer added afterwards
  // misses entries already emitted, and LCP in particular is usually one of
  // them - which reports 0 and looks like a very fast page.
  await page.addInitScript(() => {
    (window as unknown as { __vitals: Vitals }).__vitals = { lcp: 0, cls: 0, tbt: 0, shifts: [] };
    const v = (window as unknown as { __vitals: Vitals }).__vitals;

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        v.lcp = Math.max(v.lcp, entry.startTime);
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as {
        value: number;
        startTime: number;
        hadRecentInput: boolean;
        sources?: { node?: Element; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }[];
      }[]) {
        // Shifts within 500ms of an interaction are the page responding to the
        // user, not moving underneath them, and are excluded by definition.
        if (entry.hadRecentInput) continue;
        v.cls += entry.value;
        // What moved, and from where to where. A CLS figure with no source is
        // a number nobody can act on: this one sat at 93% of budget for three
        // separate attempts at a fix, each aimed at a guess.
        v.shifts.push({
          value: Number(entry.value.toFixed(4)),
          at: Math.round(entry.startTime),
          sources: (entry.sources ?? []).map((s) => {
            const el = s.node as Element | undefined;
            const name = el
              ? `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`
              : 'unattributed';
            return `${name} y:${Math.round(s.previousRect.y)}->${Math.round(s.currentRect.y)} h:${Math.round(s.previousRect.height)}->${Math.round(s.currentRect.height)}`;
          }),
        });
      }
    }).observe({ type: 'layout-shift', buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // A task blocks only for the part beyond 50ms; the first 50 is the
        // budget every task is allowed.
        v.tbt += Math.max(0, entry.duration - 50);
      }
    }).observe({ type: 'longtask', buffered: true });
  });

  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  // LCP is not final until the page stops changing or the user interacts. A
  // short settle after networkidle is what makes the reading stable rather
  // than an early snapshot.
  await page.waitForTimeout(1_000);

  return page.evaluate(() => (window as unknown as { __vitals: Vitals }).__vitals);
}

describe('performance budgets, measured in a browser', () => {
  for (const route of PUBLIC_ROUTES) {
    it(`${route} is inside LCP, CLS and TBT`, async () => {
      const page = await browser.newPage();
      await page.setViewportSize(DESKTOP);

      const v = await measure(page, route);
      record('vitals', route, {
        lcpMs: Math.round(v.lcp),
        lcpBudgetMs: BUDGET.lcpMs,
        cls: Number(v.cls.toFixed(4)),
        clsBudget: BUDGET.cls,
        tbtMs: Math.round(v.tbt),
        tbtBudgetMs: BUDGET.tbtMs,
        shifts: JSON.stringify(v.shifts),
      });

      expect(v.lcp, `${route} LCP`).toBeLessThanOrEqual(BUDGET.lcpMs);
      expect(v.cls, `${route} CLS`).toBeLessThanOrEqual(BUDGET.cls);
      expect(v.tbt, `${route} TBT`).toBeLessThanOrEqual(BUDGET.tbtMs);

      await page.close();
    });
  }

  for (const route of PUBLIC_ROUTES) {
    it(`${route} ships no more than ${BUDGET.jsKib} KiB of JavaScript`, async () => {
      const page = await browser.newPage();
      await page.setViewportSize(DESKTOP);

      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      /*
       * Resource Timing, not `response.body()`.
       *
       * `body()` hands back the *decoded* bytes, so it reported 453 KiB for
       * every route here while the budget is about what the network carries.
       * Reading it as a transfer figure overstates the cost by whatever the
       * compression ratio happens to be - and the number that matters to a
       * customer on a metered connection is the one that crossed the wire.
       *
       * All three figures are reported, because a reader checking this against
       * a build log or a browser devtools panel needs to know which one is
       * being asserted.
       */
      const size = await page.evaluate(() => {
        let transfer = 0;
        let encoded = 0;
        let decoded = 0;
        for (const e of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
          if (!/\.js(\?|$)/.test(e.name) && e.initiatorType !== 'script') continue;
          transfer += e.transferSize;
          encoded += e.encodedBodySize;
          decoded += e.decodedBodySize;
        }
        return { transfer, encoded, decoded };
      });

      const kib = size.transfer / 1024;
      record('javascript', route, {
        transferredKib: Number(kib.toFixed(1)),
        budgetKib: BUDGET.jsKib,
        encodedKib: Number((size.encoded / 1024).toFixed(1)),
        decodedKib: Number((size.decoded / 1024).toFixed(1)),
      });
      expect(kib, `${route} JavaScript transferred`).toBeLessThanOrEqual(BUDGET.jsKib);

      await page.close();
    });
  }
});
