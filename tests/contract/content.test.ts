import { beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNT_ROUTES, BASE, domFor, portalIsUp, PUBLIC_ROUTES, signIn } from './portal';

/**
 * What the rendered pages actually say.
 *
 * These read the text a customer sees, after scripts and styling are stripped
 * away, because both defects they cover were invisible to every component test:
 * a heading written for the development team, and storage-format dates.
 */

let cookie: string;

beforeAll(async () => {
  if (!(await portalIsUp())) {
    throw new Error(`the portal is not answering at ${BASE}. Run \`npm run build && npm start\`.`);
  }
  cookie = await signIn();
}, 120_000);

/**
 * The visible text of a route, with script and style content removed.
 *
 * Text nodes are joined with a space rather than read from `textContent`.
 * `textContent` concatenates across element boundaries, so the dashboard's
 * `<dt>Due</dt><dd>22 September 2026</dd>` becomes `Due22 September 2026` - and
 * a date assertion anchored on a word boundary then fails against text that is
 * perfectly correct on screen.
 */
async function visibleText(path: string, cookie?: string): Promise<string> {
  const { window, dom } = await domFor(path, cookie);
  for (const el of window.document.querySelectorAll('script, style, template')) el.remove();
  const walker = window.document.createTreeWalker(window.document.body, 4 /* SHOW_TEXT */);
  const parts: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.nodeValue?.trim();
    if (value) parts.push(value);
  }
  dom.window.close();
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

async function everyRoute(): Promise<[string, string | undefined][]> {
  return [
    ...PUBLIC_ROUTES.map((r) => [r, undefined] as [string, undefined]),
    ...ACCOUNT_ROUTES.map((r) => [r, cookie] as [string, string]),
  ];
}

describe('no page speaks to the development team', () => {
  // Every one of these was a real heading or sentence on a customer page, or is
  // vocabulary from the specification that must not leak into one.
  //
  // Matched on whole words. A substring match reported "Support" as the word
  // "port", which is the check crying wolf about correct copy - and a check that
  // reports a defect where there is none gets ignored, which is how a real one
  // then slips through.
  const INTERNAL = ['increment', 'increments', 'deliverable', 'deliverables', 'adapter', 'port', 'phase'];
  const pattern = new RegExp(`\\b(${INTERNAL.join('|')})\\b`, 'gi');

  it('uses none of the build’s vocabulary', async () => {
    const seen: string[] = [];
    for (const [path, c] of await everyRoute()) {
      const text = await visibleText(path, c);
      // Guards against a route that renders nothing passing by default.
      expect(text.length, `${path} rendered no text`).toBeGreaterThan(80);
      for (const match of text.matchAll(pattern)) seen.push(`${path}: "${match[0]}"`);
    }
    expect(seen).toEqual([]);
  }, 180_000);
});

describe('no page shows a customer a storage format', () => {
  it('prints no ISO date or month', async () => {
    const seen: string[] = [];
    for (const [path, c] of await everyRoute()) {
      const text = await visibleText(path, c);
      expect(text.length, `${path} rendered no text`).toBeGreaterThan(80);
      // 2026-09-22 and 2026-07 alike. Invoice references such as INV/2026/00086
      // use slashes and are unaffected.
      for (const match of text.matchAll(/\b\d{4}-\d{2}(?:-\d{2})?\b/g)) {
        seen.push(`${path}: ${match[0]}`);
      }
    }
    expect(seen).toEqual([]);
  }, 180_000);

  it('writes the due date in words when there is one', async () => {
    const text = await visibleText('/account', cookie);
    expect(text).toMatch(/\b\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\b/);
  }, 60_000);

  it('writes usage months in words', async () => {
    const text = await visibleText('/account', cookie);
    expect(text).toMatch(/(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}/);
  }, 60_000);
});

describe('the dashboard states each figure once', () => {
  it('does not print the amount owed twice', async () => {
    const { window, dom } = await domFor('/account', cookie);
    const card = window.document.querySelector('.vw-card h2')?.closest('.vw-card');
    const amounts = (card?.textContent ?? '').match(/FJ\$[\d,]+\.\d{2}/g) ?? [];
    dom.window.close();
    // The headline is the amount; the list beneath it repeated the same figure.
    expect(amounts.length, `found ${amounts.join(', ')}`).toBeLessThanOrEqual(1);
  }, 60_000);
});
