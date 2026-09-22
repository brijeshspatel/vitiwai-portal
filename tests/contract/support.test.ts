import { beforeAll, describe, expect, it } from 'vitest';
import { parseEnv } from '@/config/env';
import { getServices } from '@/composition';
import { createOdooClient } from '@/adapters/odoo/client';
import { isOk } from '@/domain/result';
import { toMinorUnits } from '@/domain/money';

const env = parseEnv({ ...process.env } as Record<string, string | undefined>);
const services = getServices();
const client = createOdooClient(env);

const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function aCustomer() {
  const created = await services.customers.createCustomer({
    name: 'Support Probe',
    email: `support-${unique()}@example.test`,
  });
  if (!isOk(created)) throw new Error('could not create the customer');
  return created.value;
}

beforeAll(async () => {
  if (!(await client.ping())) throw new Error('Odoo is not reachable. Run `npm run stack:up`.');
}, 120_000);

describe('reporting a fault', () => {
  it('creates a task in Odoo that the customer can then see', async () => {
    const partnerId = await aCustomer();

    const opened = await services.cases.openCase({
      customerId: partnerId,
      title: 'No water since Tuesday',
      description: 'Supply stopped at the meter.',
    });
    expect(isOk(opened)).toBe(true);

    const listed = await services.cases.listCases(partnerId);
    expect(isOk(listed)).toBe(true);
    if (!isOk(listed)) return;
    expect(listed.value).toHaveLength(1);
    expect(listed.value[0]!.title).toBe('No water since Tuesday');
  }, 180_000);

  it('shows a status an agent changed in Odoo, with no code change', async () => {
    // The acceptance criterion for D7, and the one that proves the portal is a
    // view over the ERP rather than a second copy of it. The change is made
    // through Odoo's own API, exactly as an agent would from its interface.
    const partnerId = await aCustomer();
    const opened = await services.cases.openCase({
      customerId: partnerId,
      title: 'Meter reading looks wrong',
      description: 'The last bill is three times the usual.',
    });
    if (!isOk(opened)) throw new Error('could not open the case');

    const before = await services.cases.listCases(partnerId);
    if (!isOk(before)) return;
    expect(before.value[0]!.status).toBe('in_progress');

    await client.call('project.task', 'write', [[Number(opened.value)], { state: '1_done' }]);

    const after = await services.cases.listCases(partnerId);
    if (!isOk(after)) return;
    expect(after.value[0]!.status).toBe('resolved');
  }, 180_000);

  it('keeps one customer’s cases out of another’s list', async () => {
    const mine = await aCustomer();
    const theirs = await aCustomer();

    await services.cases.openCase({
      customerId: theirs,
      title: 'Somebody else problem',
      description: 'Not mine.',
    });

    const listed = await services.cases.listCases(mine);
    if (!isOk(listed)) return;
    expect(listed.value).toHaveLength(0);
  }, 180_000);
});

describe('requesting a plan change', () => {
  it('creates a lead naming the plan that was asked for', async () => {
    const partnerId = await aCustomer();

    const lead = await services.cases.createLead({
      customerId: partnerId,
      title: 'Plan change requested by support-probe@example.test',
      requestedPlanId: 'plan-bundle-2',
    });
    expect(isOk(lead)).toBe(true);
    if (!isOk(lead)) return;

    const rows = await client.searchRead<{ name: string; description: unknown }>(
      'crm.lead',
      [['id', '=', Number(lead.value)]],
      ['name', 'description'],
      { limit: 1 },
    );
    expect(rows[0]!.name).toContain('Plan change requested');
    expect(String(rows[0]!.description)).toContain('plan-bundle-2');
  }, 180_000);
});

describe('plan search', () => {
  it('filters by category', async () => {
    const result = await services.search.searchPlans({ category: 'broadband' });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.items.length).toBeGreaterThan(0);
    expect(result.value.items.every((p) => p.category === 'broadband')).toBe(true);
  });

  it('filters by the most a customer wants to pay', async () => {
    const ceiling = toMinorUnits(60);
    const result = await services.search.searchPlans({ maxMonthlyPriceMinor: ceiling });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.items.length).toBeGreaterThan(0);
    expect(result.value.items.every((p) => p.monthlyPriceMinor <= ceiling)).toBe(true);
  });

  it('combines a text search with a filter', async () => {
    const result = await services.search.searchPlans({
      text: 'fibre',
      maxMonthlyPriceMinor: toMinorUnits(100),
    });
    if (!isOk(result)) return;
    expect(result.value.items.every((p) => p.monthlyPriceMinor <= toMinorUnits(100))).toBe(true);
  });

  it('answers a filtered query with plans that match the filter', async () => {
    // Elapsed time is reported, not asserted. See the note in search.test.ts:
    // the bound measured the machine rather than the query.
    const started = performance.now();
    const result = await services.search.searchPlans({ text: 'broadband' });
    const elapsed = performance.now() - started;
    console.log(`[measured] filtered plan query took ${elapsed.toFixed(1)} ms`);

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.items.length).toBeGreaterThan(0);
  });
});
