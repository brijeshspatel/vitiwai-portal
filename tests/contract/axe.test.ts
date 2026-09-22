import axe from 'axe-core';
import { beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNT_ROUTES, BASE, domFor, portalIsUp, PUBLIC_ROUTES, signIn } from './portal';

/**
 * WCAG 2.2 A and AA, measured on every route the customer can reach.
 *
 * Read the limitation before trusting a pass. jsdom has no layout engine, so
 * two rules cannot be decided here, and they fail in two different ways:
 *
 *   color-contrast   runs and returns `incomplete` - it announces itself
 *   target-size      never runs at all - it is absent from the result
 *
 * A reader counting "zero violations" would take both as passes. Neither is
 * left to axe: the token pairings are computed in tests/unit/tokens.test.ts, and
 * the control sizes are asserted against the stylesheet in
 * tests/unit/css-contract.test.ts. Both of those are deterministic and neither
 * depends on a layout engine.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

let cookie: string;

beforeAll(async () => {
  if (!(await portalIsUp())) {
    throw new Error(`the portal is not answering at ${BASE}. Run \`npm run build && npm start\`.`);
  }
  cookie = await signIn();
}, 120_000);

async function audit(path: string, withCookie?: string) {
  const { window, dom } = await domFor(path, withCookie);
  window.eval(axe.source);
  const result = await (window as unknown as { axe: typeof axe }).axe.run(window.document, {
    runOnly: { type: 'tag', values: TAGS },
  });
  const evaluated = result.passes.length + result.violations.length + result.incomplete.length;
  const nodes = result.passes.reduce((total, rule) => total + rule.nodes.length, 0);
  const summary = result.violations.map(
    (v) => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.nodes[0]?.html?.slice(0, 90)}`,
  );
  dom.window.close();
  return { violations: summary, evaluated, nodes, incomplete: result.incomplete.map((i) => i.id) };
}

/**
 * The floor that proves axe looked at something, measured rather than guessed.
 *
 * A route with no form has fewer applicable rules, so a single number taken from
 * one page is not a property of the suite. Measured on 2026-09-22, across all
 * eight routes, rules evaluated and nodes passing:
 *
 *   /                     16 / 27      /account              26 / 42
 *   /plans                27 / 96      /account/pay          25 / 51
 *   /join                 21 / 60      /account/support      25 / 39
 *   /signin               21 / 32      /account/change-plan  23 / 46
 *
 * The thresholds sit just below the smallest of each, so they catch a harness
 * that examined nothing without encoding which page has the most widgets.
 */
const MIN_RULES = 15;
const MIN_NODES = 20;

describe('every public route meets WCAG 2.2 AA, as far as jsdom can decide', () => {
  it.each([...PUBLIC_ROUTES])('%s', async (path) => {
    const { violations, evaluated, nodes } = await audit(path);
    expect(violations).toEqual([]);
    // Without these, a harness that examined nothing would report zero
    // violations and pass.
    expect(evaluated, `axe evaluated only ${evaluated} rules on ${path}`).toBeGreaterThanOrEqual(MIN_RULES);
    expect(nodes, `axe checked only ${nodes} nodes on ${path}`).toBeGreaterThanOrEqual(MIN_NODES);
  }, 120_000);
});

describe('every account route meets WCAG 2.2 AA, as far as jsdom can decide', () => {
  it.each([...ACCOUNT_ROUTES])('%s', async (path) => {
    const { violations, evaluated, nodes } = await audit(path, cookie);
    expect(violations).toEqual([]);
    expect(evaluated, `axe evaluated only ${evaluated} rules on ${path}`).toBeGreaterThanOrEqual(MIN_RULES);
    expect(nodes, `axe checked only ${nodes} nodes on ${path}`).toBeGreaterThanOrEqual(MIN_NODES);
  }, 120_000);
});

describe('the audit is honest about what it could not decide', () => {
  it('reports colour contrast as undecided rather than passed', async () => {
    // If this ever stops being incomplete, jsdom has gained layout and the
    // separate token test could be reconsidered. Until then, a reader who sees
    // "zero violations" needs to know contrast was not among the things checked.
    const { incomplete } = await audit('/signin');
    expect(incomplete).toContain('color-contrast');
  }, 120_000);

  it('never ran target-size, which is why the stylesheet is asserted directly', async () => {
    const { incomplete } = await audit('/join');
    const ran = incomplete.includes('target-size');
    expect(ran, 'target-size now runs in jsdom; fold it back into this suite').toBe(false);
  }, 120_000);
});
