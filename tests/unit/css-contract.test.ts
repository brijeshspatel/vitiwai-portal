import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Invariants of the stylesheet itself.
 *
 * These exist because the two rules they guard are not decorative, and because
 * neither is checkable where it matters. `axe-core` in jsdom never runs
 * `target-size` at all - the rule is absent from the result, not reported as
 * incomplete - so a suite relying on axe alone would report a pass on a check
 * that never happened.
 */

const css = readFileSync(
  fileURLToPath(new URL('../../src/app/globals.css', import.meta.url)),
  'utf8',
);

/** The declarations of the first rule whose selector matches. */
function ruleFor(selectorPart: string): string {
  const index = css.indexOf(selectorPart);
  expect(index, `no rule in globals.css mentions ${selectorPart}`).toBeGreaterThan(-1);
  const open = css.indexOf('{', index);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

function px(declarations: string, property: string): number {
  const match = new RegExp(`${property}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`).exec(declarations);
  expect(match, `${property} is not declared in px`).not.toBeNull();
  return Number(match![1]);
}

describe('form controls are large enough and legible', () => {
  const control = ruleFor("input:not([type='checkbox'])");

  it('meets the WCAG 2.2 AA target size, with room to spare', () => {
    expect(px(control, 'min-height')).toBeGreaterThanOrEqual(24);
  });

  it('uses a font iOS Safari will not zoom the page for', () => {
    // Anything below 16px makes mobile Safari zoom on focus and never zoom back.
    expect(px(control, 'font-size')).toBeGreaterThanOrEqual(16);
  });

  it('inherits the page font rather than falling back to Arial', () => {
    expect(control).toMatch(/font-family:\s*inherit/);
  });

  it('applies to every control, not to one component', () => {
    // The defect was this rule being scoped to `.vw-filters`. A selector that
    // names a component again would reintroduce it silently.
    const selectorStart = css.lastIndexOf('\n', css.indexOf("input:not([type='checkbox'])"));
    const selector = css.slice(selectorStart, css.indexOf('{', selectorStart));
    expect(selector).not.toMatch(/\.vw-/);
    expect(selector).toMatch(/\bselect\b/);
    expect(selector).toMatch(/\btextarea\b/);
  });

  it('keeps checkboxes and radios at the 24px target too', () => {
    const choice = ruleFor("input[type='checkbox'],");
    expect(px(choice, 'width')).toBeGreaterThanOrEqual(24);
    expect(px(choice, 'height')).toBeGreaterThanOrEqual(24);
  });
});

describe('the wide-screen navigation is forced visible both ways', () => {
  // This guards a regression no other test here can see. The navigation
  // disappeared from the header entirely, while remaining in the DOM with four
  // links and a 271px box, because Chrome 131 hides `details` contents through
  // `::details-content { content-visibility: hidden }` rather than by setting
  // `display` on the children. jsdom has no layout or painting, so the contract
  // tests reported the navigation present and correct throughout.
  it('overrides display, for engines that hide the children that way', () => {
    expect(ruleFor('.vw-nav__disclosure > .vw-nav__list')).toMatch(/display:\s*flex/);
  });

  it('overrides content-visibility, for engines that use ::details-content', () => {
    expect(css).toMatch(/\.vw-nav__disclosure::details-content\s*\{/);
    expect(ruleFor('.vw-nav__disclosure::details-content')).toMatch(
      /content-visibility:\s*visible/,
    );
  });
});

describe('the layout has a narrow state at all', () => {
  // Before increment 1D the stylesheet had two media queries, neither about
  // width. Nothing overflowed at 390px because flex-wrap absorbed it, so a
  // "nothing overflows" check passed on a layout that had never been designed
  // for a phone. This asserts the breakpoint exists and does the work.
  const narrow = (() => {
    const at = css.indexOf('@media (max-width:');
    expect(at, 'the stylesheet declares no width breakpoint').toBeGreaterThan(-1);
    // Take everything to the next top-level @media or end of file.
    const next = css.indexOf('@media', at + 10);
    return css.slice(at, next === -1 ? css.length : next);
  })();

  it('collapses the navigation into a menu rather than stacking rows', () => {
    expect(narrow).toMatch(/\.vw-nav__toggle\s*\{[^}]*display:\s*inline-flex/);
    expect(narrow).toMatch(/\.vw-nav__disclosure:not\(\[open\]\)\s*>\s*\.vw-nav__list\s*\{[^}]*display:\s*none/);
  });

  it('gives each menu row a full-width target', () => {
    expect(narrow).toMatch(/min-height:\s*44px/);
  });

  it('stacks the grids to one column', () => {
    expect(narrow).toMatch(/\.vw-grid\s*\{[^}]*grid-template-columns:\s*1fr/);
    expect(narrow).toMatch(/\.vw-filters\s*\{[^}]*grid-template-columns:\s*1fr/);
  });

  it('drops the usage bar track, which carries nothing at that width', () => {
    expect(narrow).toMatch(/\.vw-usage__track\s*\{[^}]*display:\s*none/);
  });
});

describe('a card is a container and the measure belongs to its text', () => {
  it('does not cap the card itself', () => {
    expect(ruleFor('.vw-card.vw-prose {')).toMatch(/max-width:\s*none/);
  });

  it('caps the text inside it instead', () => {
    expect(ruleFor('.vw-card.vw-prose > p')).toMatch(/max-width:\s*var\(--vw-measure\)/);
  });
});

describe('links take their colour from the tokens', () => {
  it('defines a colour for a plain link', () => {
    expect(ruleFor('\na {')).toMatch(/color:\s*var\(--vw-accent\)/);
  });

  it('defines :visited, which is what the browser default was showing', () => {
    expect(css).toMatch(/a:visited\s*\{/);
    expect(ruleFor('a:visited')).toMatch(/color:\s*var\(--vw-/);
  });
});
