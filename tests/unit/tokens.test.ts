import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Colour contrast, computed from the tokens themselves.
 *
 * This is not a proxy for the real check - the tokens *are* where the colours
 * come from, so computing the ratio between the pairings actually used is the
 * check. It exists because `axe-core` running in jsdom returns `color-contrast`
 * as **incomplete**: it has no layout engine and declines to decide. Recording
 * that as a pass would be reporting a check that never ran.
 */

const css = readFileSync(
  fileURLToPath(new URL('../../src/app/globals.css', import.meta.url)),
  'utf8',
);

/** The tokens declared in one block, by name. */
function tokensIn(blockStart: string): Record<string, string> {
  const at = css.indexOf(blockStart);
  expect(at, `no block starting ${blockStart}`).toBeGreaterThan(-1);
  const open = css.indexOf('{', at);
  const close = css.indexOf('}', open);
  const out: Record<string, string> = {};
  for (const match of css.slice(open, close).matchAll(/(--vw-[a-z-]+)\s*:\s*(#[0-9a-f]{3,8})/gi)) {
    out[match[1]!] = match[2]!;
  }
  return out;
}

function channels(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return Number(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)).toFixed(2));
}

/** Text colour on background, for every pairing the stylesheet actually uses. */
const PAIRINGS: [string, string, number][] = [
  ['--vw-text', '--vw-surface', 4.5],
  ['--vw-text', '--vw-surface-raised', 4.5],
  ['--vw-text', '--vw-surface-sunken', 4.5],
  ['--vw-text-muted', '--vw-surface', 4.5],
  ['--vw-text-muted', '--vw-surface-raised', 4.5],
  ['--vw-text-muted', '--vw-surface-sunken', 4.5],
  ['--vw-accent', '--vw-surface', 4.5],
  ['--vw-accent', '--vw-surface-raised', 4.5],
  ['--vw-accent-text', '--vw-accent', 4.5],
  ['--vw-danger', '--vw-surface-raised', 4.5],
  ['--vw-success', '--vw-surface-raised', 4.5],
];

describe.each([
  ['light', ':root {'],
  ['dark', ":root[data-theme='dark']"],
])('%s theme meets WCAG AA', (_theme, block) => {
  const tokens = tokensIn(block);

  it('declares every token the pairings need', () => {
    // Guards the whole suite: a renamed token would otherwise silently reduce
    // the pairing list to nothing and every case below would vacuously pass.
    const needed = new Set(PAIRINGS.flatMap(([a, b]) => [a, b]));
    for (const name of needed) {
      expect(tokens[name], `${name} is not declared in this block`).toBeDefined();
    }
    expect(Object.keys(tokens).length).toBeGreaterThanOrEqual(needed.size);
  });

  it.each(PAIRINGS)('%s on %s', (fg, bg, minimum) => {
    const measured = ratio(tokens[fg]!, tokens[bg]!);
    expect(measured, `${fg} on ${bg} is ${measured}:1, below ${minimum}:1`).toBeGreaterThanOrEqual(
      minimum,
    );
  });
});

describe('the contrast calculation itself', () => {
  // A ratio function that returned a large number for everything would pass all
  // of the above. These are the two fixed points of the scale.
  it('reports 21:1 for black on white', () => {
    expect(ratio('#000000', '#ffffff')).toBe(21);
  });

  it('reports 1:1 for a colour on itself', () => {
    expect(ratio('#7cc2f0', '#7cc2f0')).toBe(1);
  });

  it('fails a pairing that should fail', () => {
    expect(ratio('#3a4550', '#111820')).toBeLessThan(4.5);
  });
});
