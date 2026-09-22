import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { BASE, launch, requirePortal } from './browser';

/**
 * Proves the harness before anything depends on it.
 *
 * Every other file in this project asserts something about a painted page. If
 * the browser never opened the page, those assertions would pass or fail for
 * reasons that have nothing to do with the product. This file fails first and
 * loudly when that is the case.
 */

let browser: Browser;

beforeAll(async () => {
  await requirePortal();
  browser = await launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

describe('the harness', () => {
  it('opens the home page in a browser that paints', async () => {
    const page = await browser.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });

    // A layout engine is the entire reason this project exists, so the smoke
    // test checks for one rather than for text: a non-zero box means styles
    // resolved and the page was laid out, which is what jsdom cannot do.
    const box = await page.locator('h1').first().boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThan(0);
    expect(box!.width).toBeGreaterThan(0);

    await page.close();
  });

  it('resolves stylesheets, so computed colour is real', async () => {
    const page = await browser.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });

    const colour = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    // jsdom answers `rgba(0, 0, 0, 0)` here whatever the stylesheet says,
    // because it never applies one. A real value is the proof that contrast
    // checks in this project mean something.
    expect(colour).not.toBe('');
    expect(colour).not.toBe('rgba(0, 0, 0, 0)');

    await page.close();
  });
});
