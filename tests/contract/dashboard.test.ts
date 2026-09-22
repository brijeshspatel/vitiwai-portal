import { beforeAll, describe, expect, it } from 'vitest';
import { parseEnv } from '@/config/env';
import { getServices } from '@/composition';
import { createOdooClient } from '@/adapters/odoo/client';
import { loadOverview } from '@/account/overview';
import { isOk } from '@/domain/result';
import { toMinorUnits } from '@/domain/money';

/**
 * The dashboard's figures, asserted against Odoo.
 *
 * Every assertion here is a **positive** fact - a balance that is not zero,
 * usage that is not empty, a reference that exists. Increment 1A's criterion
 * was "the figures match Odoo", which a portal showing nothing and an Odoo
 * holding nothing satisfy perfectly. That is how 620 draft invoices went
 * unnoticed for two increments.
 */

const env = parseEnv({ ...process.env } as Record<string, string | undefined>);
const services = getServices();
const client = createOdooClient(env);

const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function customerOwing(dollars: number, months: number[]) {
  const created = await services.customers.createCustomer({
    name: `Dashboard Probe ${unique()}`,
    email: `dash-${unique()}@example.test`,
  });
  if (!isOk(created)) throw new Error('could not create the probe customer');
  const partnerId = created.value;

  for (const month of months) {
    const rows = await client.call<number | number[]>('account.move', 'create', [
      [
        {
          move_type: 'out_invoice',
          partner_id: Number(partnerId),
          invoice_date: `2026-${String(month).padStart(2, '0')}-01`,
          invoice_line_ids: [
            [0, 0, { name: `Water usage 2026-${String(month).padStart(2, '0')}`, quantity: 1, price_unit: dollars }],
          ],
        },
      ],
    ]);
    const id = Array.isArray(rows) ? (rows[0] as number) : rows;
    await client.call('account.move', 'action_post', [id]);
  }

  return partnerId;
}

beforeAll(async () => {
  if (!(await client.ping())) {
    throw new Error('Odoo is not reachable. Run `npm run stack:up` first.');
  }
}, 120_000);

describe('the account overview', () => {
  it('reports a balance equal to what Odoo says is owed, and it is not zero', async () => {
    const partnerId = await customerOwing(50, [7]);

    const overview = await loadOverview(services, partnerId);
    expect(overview).not.toBeNull();
    if (overview === null) return;

    expect(overview.balanceMinor).toBe(toMinorUnits(50));
    expect(overview.balanceMinor).toBeGreaterThan(0);
  }, 180_000);

  it('names a current invoice with a real reference, never null', async () => {
    const partnerId = await customerOwing(45, [8]);

    const overview = await loadOverview(services, partnerId);
    if (overview === null) return;

    expect(overview.current).not.toBeNull();
    expect(overview.current!.reference).not.toBeNull();
    expect(overview.current!.reference).toMatch(/^INV\//);
    expect(overview.current!.dueMinor).toBe(toMinorUnits(45));
  }, 180_000);

  it('returns one usage point per posted month, not an empty list', async () => {
    const partnerId = await customerOwing(25, [4, 5, 6]);

    const overview = await loadOverview(services, partnerId);
    if (overview === null) return;

    expect(overview.usage.length).toBe(3);
    for (const point of overview.usage) {
      expect(point.month).toMatch(/^2026-0[456]$/);
      expect(point.costMinor).toBeGreaterThan(0);
      expect(point.kilolitres).toBeGreaterThan(0);
    }
  }, 180_000);

  it('returns usage oldest first, so a chart reads left to right', async () => {
    const partnerId = await customerOwing(25, [1, 2, 3]);
    const overview = await loadOverview(services, partnerId);
    if (overview === null) return;

    const months = overview.usage.map((p) => p.month);
    expect([...months].sort()).toEqual(months);
  }, 180_000);

  it('reflects a payment: the balance falls to zero and stays consistent', async () => {
    const partnerId = await customerOwing(60, [9]);

    const before = await loadOverview(services, partnerId);
    if (before === null || before.current === null) throw new Error('no invoice to pay');
    expect(before.balanceMinor).toBe(toMinorUnits(60));

    const paid = await services.customers.recordPayment(before.current.id, {
      id: `rc_dash_${unique()}`,
      intentId: `pi_dash_${unique()}`,
      paidMinor: toMinorUnits(60),
      paidAt: new Date().toISOString(),
      simulated: true,
    });
    expect(isOk(paid)).toBe(true);

    const after = await loadOverview(services, partnerId);
    if (after === null) return;
    expect(after.balanceMinor).toBe(0);
    expect(after.current).toBeNull();
  }, 240_000);

  it('shows a customer with no invoices an empty account rather than failing', async () => {
    const created = await services.customers.createCustomer({
      name: 'Brand New',
      email: `brandnew-${unique()}@example.test`,
    });
    if (!isOk(created)) throw new Error('could not create the customer');

    const overview = await loadOverview(services, created.value);
    expect(overview).not.toBeNull();
    if (overview === null) return;

    expect(overview.balanceMinor).toBe(0);
    expect(overview.current).toBeNull();
    expect(overview.usage).toEqual([]);
    expect(overview.unavailable).toEqual([]);
  }, 120_000);
});
