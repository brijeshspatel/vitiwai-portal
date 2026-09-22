import { beforeAll, describe, expect, it } from 'vitest';
import { parseEnv } from '@/config/env';
import { createOdooClient } from '@/adapters/odoo/client';
import { OdooCustomerAdapter } from '@/adapters/odoo/customer';
import { isOk } from '@/domain/result';

/**
 * What the seed must leave behind for the dashboard to work.
 *
 * Increment 1A's seed created 620 invoices and left every one in `draft`.
 * In that state getUsage returns nothing, partner credit is zero and every
 * reference is null - so the dashboard would have shown an empty, zero-balance
 * account for every customer while agreeing with Odoo perfectly.
 *
 * These assertions are deliberately positive. "The figures match" is satisfied
 * by both sides holding nothing.
 */

const env = parseEnv({ ...process.env } as Record<string, string | undefined>);
const client = createOdooClient(env);
const customers = new OdooCustomerAdapter(client);

beforeAll(async () => {
  if (!(await client.ping())) {
    throw new Error('Odoo is not reachable. Run `npm run stack:up` and `npm run seed` first.');
  }
}, 120_000);

describe('the seeded dataset', () => {
  it('leaves no seeded invoice in draft', async () => {
    // Scoped to seeded invoices by `invoice_date`, which the seed always sets.
    //
    // A global "no drafts anywhere" assertion was wrong and made the suite
    // order-dependent: odoo.test.ts deliberately creates a draft to prove
    // convention C3, that a draft reports `name: false`. Two tests cannot both
    // own a global invariant, and the one asserting the absence of something
    // another test needs is the one that is wrong.
    // Increment 1E narrowed it again. Excluding invoices with no date removed
    // odoo.test.ts's draft, but not the ones pay.test.ts and
    // payment-erp.test.ts create - those carry a date, and vitest runs test
    // files in parallel, so this assertion caught another file's invoice
    // mid-flight and failed roughly one run in three.
    //
    // A seeded invoice is a historical one: the seed dates them across previous
    // months, and every invoice a test creates is dated today. Scoping to
    // before today makes this assert about the seed, which is what the file is
    // named for.
    const today = new Date().toISOString().slice(0, 10);
    const drafts = await client.call<number>('account.move', 'search_count', [
      [
        ['move_type', '=', 'out_invoice'],
        ['state', '=', 'draft'],
        ['invoice_date', '!=', false],
        ['invoice_date', '<', today],
      ],
    ]);
    expect(drafts).toBe(0);

    // The scope is narrower, so prove it still looks at something: the seed's
    // own posted invoices are in the same range and must be found.
    const seeded = await client.call<number>('account.move', 'search_count', [
      [
        ['move_type', '=', 'out_invoice'],
        ['invoice_date', '!=', false],
        ['invoice_date', '<', today],
      ],
    ]);
    expect(seeded, 'the narrowed scope matched no seeded invoice at all').toBeGreaterThan(0);
  }, 60_000);

  it('has posted invoices to read', async () => {
    const posted = await client.call<number>('account.move', 'search_count', [
      [
        ['move_type', '=', 'out_invoice'],
        ['state', '=', 'posted'],
        ['invoice_date', '!=', false],
      ],
    ]);
    // Not an absolute count. CI seeds 25 customers and a developer seeds 200,
    // so any fixed threshold is really an assertion about which machine is
    // running - which is how this first failed in CI at 92 against a hard-coded
    // 100. What matters is that posting happened at all; the companion test
    // asserts that none was left behind.
    expect(posted).toBeGreaterThan(0);
  }, 60_000);

  it('gives every posted invoice a real reference, never null', async () => {
    const rows = await client.searchRead<{ id: number; name: unknown }>(
      'account.move',
      [
        ['move_type', '=', 'out_invoice'],
        ['state', '=', 'posted'],
        ['invoice_date', '!=', false],
      ],
      ['id', 'name'],
      { limit: 20 },
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.name, `invoice ${row.id} has no reference`).not.toBe(false);
      expect(String(row.name)).toMatch(/^INV\//);
    }
  }, 60_000);

  it('gives a seeded customer a non-zero balance equal to what they owe', async () => {
    const found = await customers.findCustomerByEmail('adi.baleiwai.19@example.test');
    expect(isOk(found)).toBe(true);
    if (!isOk(found) || found.value === null) throw new Error('the seeded customer is missing');

    const invoices = await customers.listInvoices(found.value.id);
    expect(isOk(invoices)).toBe(true);
    if (!isOk(invoices)) return;

    const owed = invoices.value.reduce((sum, i) => sum + i.dueMinor, 0);
    expect(owed).toBeGreaterThan(0);
    expect(found.value.balanceMinor).toBe(owed);
  }, 60_000);

  it('returns twelve months of usage rather than an empty list', async () => {
    const found = await customers.findCustomerByEmail('adi.baleiwai.19@example.test');
    if (!isOk(found) || found.value === null) throw new Error('the seeded customer is missing');

    const usage = await customers.getUsage(found.value.id, 12);
    expect(isOk(usage)).toBe(true);
    if (!isOk(usage)) return;

    // The seed writes three invoices per customer, so three points is what
    // twelve months of history currently contains. The assertion that matters
    // is that it is not zero.
    expect(usage.value.length).toBeGreaterThan(0);
    for (const point of usage.value) {
      expect(point.month).toMatch(/^\d{4}-\d{2}$/);
      expect(point.costMinor).toBeGreaterThan(0);
    }
  }, 60_000);
});
