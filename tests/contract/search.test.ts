import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseEnv } from '@/config/env';
import { MeilisearchAdapter } from '@/adapters/search/meilisearch';
import { isOk } from '@/domain/result';
import { toMinorUnits } from '@/domain/money';
import type { Plan } from '@/domain/types';

const env = parseEnv({ ...process.env } as Record<string, string | undefined>);

// An index of this run's own. Sharing the real `plans` index makes every
// assertion below depend on whatever the seed happened to load, which is why
// this suite passed locally and failed in CI on 2026-09-21.
const INDEX = `plans-contract-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const search = new MeilisearchAdapter(env, { indexName: INDEX });

const PLANS: Plan[] = [
  {
    id: 'test-water-basic',
    name: 'Household Water Basic',
    category: 'water',
    monthlyPriceMinor: toMinorUnits(28.5),
    includedKilolitres: 12,
    downloadMbps: null,
    description: 'Metered water supply for a small household in Suva.',
  },
  {
    id: 'test-broadband-100',
    name: 'Fibre Broadband 100',
    category: 'broadband',
    monthlyPriceMinor: toMinorUnits(89),
    includedKilolitres: null,
    downloadMbps: 100,
    description: 'Unshaped fibre broadband at 100 Mbps download.',
  },
  {
    id: 'test-bundle-max',
    name: 'Home Bundle Max',
    category: 'bundle',
    monthlyPriceMinor: toMinorUnits(139),
    includedKilolitres: 20,
    downloadMbps: 200,
    description: 'Water and fibre broadband together at a reduced rate.',
  },
];

beforeAll(async () => {
  const indexed = await search.indexPlans(PLANS);
  if (!indexed.ok) {
    throw new Error(
      `Meilisearch is not usable at ${env.MEILI_URL}: ${indexed.error.message}. ` +
        'Run `npm run stack:up` first.',
    );
  }
}, 120_000);

afterAll(async () => {
  // Leaving a per-run index behind would accumulate one per CI run.
  await search.dropIndex().catch(() => undefined);
}, 60_000);

describe('plan discovery', () => {
  it('returns every plan for an empty query', async () => {
    const result = await search.searchPlans({});
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    const ids = result.value.items.map((p) => p.id);
    for (const plan of PLANS) expect(ids).toContain(plan.id);
  });

  it('ranks a text match above the rest', async () => {
    const result = await search.searchPlans({ text: 'fibre broadband' });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.items.length).toBeGreaterThan(0);
    expect(result.value.items[0]?.id).toBe('test-broadband-100');
  });

  it('filters by category', async () => {
    const result = await search.searchPlans({ category: 'water' });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.items.every((p) => p.category === 'water')).toBe(true);
    expect(result.value.items.map((p) => p.id)).toContain('test-water-basic');
  });

  it('filters by maximum monthly price, in minor units', async () => {
    const result = await search.searchPlans({ maxMonthlyPriceMinor: toMinorUnits(90) });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    const ids = result.value.items.map((p) => p.id);
    expect(ids).toContain('test-water-basic');
    expect(ids).toContain('test-broadband-100');
    // 139.00 is above the 90.00 ceiling, so the filter must exclude it.
    // If filterableAttributes were not configured this assertion is what fails.
    expect(ids).not.toContain('test-bundle-max');
  });

  it('preserves money as integer minor units through the round trip', async () => {
    const result = await search.searchPlans({ text: 'Home Bundle Max' });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.items[0]?.monthlyPriceMinor).toBe(13900);
  });

  it('answers a plan query with the matching plans', async () => {
    // The elapsed time is measured and reported, and nothing asserts on it.
    //
    // It used to assert `elapsed < 200`, which failed on a loaded machine and
    // passed on an idle one while the code was identical - so a red run meant
    // "something else was running", which is not a defect anyone can fix. A
    // wall-clock bound in a shared environment measures the environment.
    //
    // Timing that IS asserted lives in the browser project, against budgets
    // taken from a page that painted, where the number means something.
    const started = performance.now();
    const result = await search.searchPlans({ text: 'broadband' });
    const elapsed = performance.now() - started;
    console.log(`[measured] plan query took ${elapsed.toFixed(1)} ms`);

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.items.length).toBeGreaterThan(0);
    expect(
      result.value.items.every((p) => `${p.name} ${p.description ?? ''}`.toLowerCase().includes('broadband')),
    ).toBe(true);
  });
});
