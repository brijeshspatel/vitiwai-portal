import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { parseEnv } from '@/config/env';
import { getServices } from '@/composition';
import { createOdooClient } from '@/adapters/odoo/client';
import { createPool } from '@/db/client';
import { createPortalUser } from '@/db/users';
import { payInvoice } from '@/payments/pay';
import { isOk } from '@/domain/result';
import { toMinorUnits, type Money } from '@/domain/money';

/**
 * Paying a bill, end to end.
 *
 * These are the only tests in this increment whose failure costs a customer
 * money, so they are written first and they assert against Odoo and the
 * database rather than against the flow's own return value.
 */

const env = parseEnv({ ...process.env } as Record<string, string | undefined>);
const services = getServices();
const client = createOdooClient(env);
let pool: pg.Pool;

const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** Receipts are captured rather than sent, so a test does not depend on SMTP. */
const sent: Array<{ to: string; receiptId: string }> = [];
const captureReceipt = async (to: string, receiptId: string) => {
  sent.push({ to, receiptId });
};

async function customerWithBill(dollars: number) {
  const email = `pay-${unique()}@example.test`;
  const created = await services.customers.createCustomer({ name: 'Payer', email });
  if (!isOk(created)) throw new Error('could not create the customer');
  const partnerId = created.value;

  const user = await createPortalUser(pool, {
    email,
    password: 'a strong enough phrase',
    odooPartnerId: partnerId,
  });

  const rows = await client.call<number | number[]>('account.move', 'create', [
    [
      {
        move_type: 'out_invoice',
        partner_id: Number(partnerId),
        invoice_date: '2026-09-01',
        invoice_line_ids: [[0, 0, { name: 'Water usage', quantity: 1, price_unit: dollars }]],
      },
    ],
  ]);
  const invoiceId = String(Array.isArray(rows) ? (rows[0] as number) : rows);
  await client.call('account.move', 'action_post', [Number(invoiceId)]);

  return { email, partnerId, userId: user.id, invoiceId, amountMinor: toMinorUnits(dollars) as Money };
}

async function residual(invoiceId: string) {
  const rows = await client.searchRead<{ amount_residual: number }>(
    'account.move',
    [['id', '=', Number(invoiceId)]],
    ['amount_residual'],
    { limit: 1 },
  );
  return toMinorUnits(rows[0]!.amount_residual);
}

async function successCount(invoiceId: string) {
  const rows = await pool.query(
    "SELECT count(*) FROM payment WHERE invoice_id = $1 AND status = 'succeeded'",
    [invoiceId],
  );
  return Number((rows.rows[0] as { count: string }).count);
}

beforeAll(async () => {
  pool = createPool(env.PORTAL_DATABASE_URL);
  if (!(await client.ping())) throw new Error('Odoo is not reachable. Run `npm run stack:up`.');
}, 120_000);

afterAll(async () => {
  await pool?.end();
});

describe('paying a bill', () => {
  it('takes the money and clears the invoice in Odoo', async () => {
    const bill = await customerWithBill(50);
    expect(await residual(bill.invoiceId)).toBe(5000);

    const outcome = await payInvoice(services, pool, captureReceipt, {
      idempotencyKey: `k-${unique()}`,
      userId: bill.userId,
      invoiceId: bill.invoiceId,
      amountMinor: bill.amountMinor,
      instrument: 'pm_test_ok',
      email: bill.email,
    });

    expect(outcome.kind).toBe('paid');
    expect(await residual(bill.invoiceId)).toBe(0);
    expect(await successCount(bill.invoiceId)).toBe(1);
  }, 240_000);

  it('charges once when the same key is submitted twice', async () => {
    // A refresh, a double-click, a retry after a timeout.
    const bill = await customerWithBill(40);
    const key = `same-${unique()}`;
    const request = {
      idempotencyKey: key,
      userId: bill.userId,
      invoiceId: bill.invoiceId,
      amountMinor: bill.amountMinor,
      instrument: 'pm_test_ok' as const,
      email: bill.email,
    };

    const first = await payInvoice(services, pool, captureReceipt, request);
    const second = await payInvoice(services, pool, captureReceipt, request);

    expect(first.kind).toBe('paid');
    expect(second.kind).toBe('paid');
    if (second.kind === 'paid') expect(second.replayed).toBe(true);

    expect(await successCount(bill.invoiceId)).toBe(1);
    expect(await residual(bill.invoiceId)).toBe(0);
  }, 240_000);

  it('leaves exactly one success when two different keys target one invoice', async () => {
    // Two tabs. The idempotency key cannot catch this; the partial unique
    // index is what does.
    const bill = await customerWithBill(30);
    const base = {
      userId: bill.userId,
      invoiceId: bill.invoiceId,
      amountMinor: bill.amountMinor,
      instrument: 'pm_test_ok' as const,
      email: bill.email,
    };

    const first = await payInvoice(services, pool, captureReceipt, {
      ...base,
      idempotencyKey: `a-${unique()}`,
    });
    const second = await payInvoice(services, pool, captureReceipt, {
      ...base,
      idempotencyKey: `b-${unique()}`,
    });

    expect(first.kind).toBe('paid');
    expect(second.kind).toBe('already_paid');
    expect(await successCount(bill.invoiceId)).toBe(1);
  }, 240_000);

  it('leaves the balance untouched when the card is declined', async () => {
    const bill = await customerWithBill(70);

    const outcome = await payInvoice(services, pool, captureReceipt, {
      idempotencyKey: `dec-${unique()}`,
      userId: bill.userId,
      invoiceId: bill.invoiceId,
      amountMinor: bill.amountMinor,
      instrument: 'pm_test_decline',
      email: bill.email,
    });

    expect(outcome.kind).toBe('declined');
    if (outcome.kind === 'declined') expect(outcome.reason).toContain('card_declined');

    expect(await residual(bill.invoiceId)).toBe(7000);
    expect(await successCount(bill.invoiceId)).toBe(0);
  }, 240_000);

  it('lets a customer retry after a decline and succeed', async () => {
    const bill = await customerWithBill(25);
    const base = {
      userId: bill.userId,
      invoiceId: bill.invoiceId,
      amountMinor: bill.amountMinor,
      email: bill.email,
    };

    const declined = await payInvoice(services, pool, captureReceipt, {
      ...base,
      idempotencyKey: `try1-${unique()}`,
      instrument: 'pm_test_insufficient',
    });
    expect(declined.kind).toBe('declined');

    const paid = await payInvoice(services, pool, captureReceipt, {
      ...base,
      idempotencyKey: `try2-${unique()}`,
      instrument: 'pm_test_ok',
    });
    expect(paid.kind).toBe('paid');
    expect(await residual(bill.invoiceId)).toBe(0);
    expect(await successCount(bill.invoiceId)).toBe(1);
  }, 240_000);

  it('records a receipt for the payer', async () => {
    const bill = await customerWithBill(15);
    sent.length = 0;

    await payInvoice(services, pool, captureReceipt, {
      idempotencyKey: `rc-${unique()}`,
      userId: bill.userId,
      invoiceId: bill.invoiceId,
      amountMinor: bill.amountMinor,
      instrument: 'pm_test_ok',
      email: bill.email,
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(bill.email);
    expect(sent[0]!.receiptId).toMatch(/^rc_/);
  }, 240_000);
});
