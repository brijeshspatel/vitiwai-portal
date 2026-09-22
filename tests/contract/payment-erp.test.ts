import { beforeAll, describe, expect, it } from 'vitest';
import { parseEnv } from '@/config/env';
import { createOdooClient } from '@/adapters/odoo/client';
import { OdooCustomerAdapter } from '@/adapters/odoo/customer';
import { isOk } from '@/domain/result';
import { toMinorUnits } from '@/domain/money';
import type { PaymentReceipt } from '@/domain/types';

/**
 * `recordPayment` must move money, not describe it.
 *
 * Until increment 1C it called `message_post`, which writes a comment on the
 * invoice and changes no figure. Deliverable 6's acceptance criterion - "a
 * successful payment reduces the Odoo balance" - was unreachable by any
 * checkout implementation built on top of it.
 *
 * These assertions read Odoo directly rather than trusting the adapter's own
 * return value. An adapter reporting success is not evidence that a balance
 * moved.
 */

const env = parseEnv({ ...process.env } as Record<string, string | undefined>);
const client = createOdooClient(env);
const customers = new OdooCustomerAdapter(client);

const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function postedInvoiceFor(partnerId: number, dollars: number) {
  const created = await client.call<number | number[]>('account.move', 'create', [
    [
      {
        move_type: 'out_invoice',
        partner_id: partnerId,
        invoice_line_ids: [[0, 0, { name: 'Utility charges', quantity: 1, price_unit: dollars }]],
      },
    ],
  ]);
  const id = Array.isArray(created) ? (created[0] as number) : created;
  await client.call('account.move', 'action_post', [id]);
  return id;
}

async function readInvoice(id: number) {
  const rows = await client.searchRead<{
    amount_residual: number;
    payment_state: string;
    state: string;
  }>('account.move', [['id', '=', id]], ['amount_residual', 'payment_state', 'state'], {
    limit: 1,
  });
  return rows[0]!;
}

async function partnerCredit(partnerId: number) {
  const rows = await client.searchRead<{ credit: number }>(
    'res.partner',
    [['id', '=', partnerId]],
    ['credit'],
    { limit: 1 },
  );
  return rows[0]!.credit;
}

const receipt = (amountMinor: number): PaymentReceipt => ({
  id: `rc_test_${unique()}`,
  intentId: `pi_test_${unique()}`,
  paidMinor: amountMinor as never,
  paidAt: new Date().toISOString(),
  simulated: true,
});

beforeAll(async () => {
  if (!(await client.ping())) {
    throw new Error('Odoo is not reachable. Run `npm run stack:up` first.');
  }
}, 120_000);

describe('recordPayment against Odoo', () => {
  it('drives the invoice residual and the partner balance to zero', async () => {
    const created = await customers.createCustomer({
      name: 'Payment Probe',
      email: `payprobe-${unique()}@example.test`,
    });
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;
    const partnerId = Number(created.value);

    const invoiceId = await postedInvoiceFor(partnerId, 50);

    // Before: the money is owed.
    const before = await readInvoice(invoiceId);
    expect(before.state).toBe('posted');
    expect(before.payment_state).toBe('not_paid');
    expect(toMinorUnits(before.amount_residual)).toBe(5000);
    expect(toMinorUnits(await partnerCredit(partnerId))).toBe(5000);

    const result = await customers.recordPayment(String(invoiceId), receipt(5000));
    expect(isOk(result)).toBe(true);

    // After: it is not. Read from Odoo, not from the adapter's return value.
    const after = await readInvoice(invoiceId);
    expect(after.payment_state).toBe('paid');
    expect(toMinorUnits(after.amount_residual)).toBe(0);
    expect(toMinorUnits(await partnerCredit(partnerId))).toBe(0);
  }, 180_000);

  it('leaves a partial payment owing the remainder', async () => {
    const created = await customers.createCustomer({
      name: 'Partial Probe',
      email: `partial-${unique()}@example.test`,
    });
    if (!isOk(created)) return;
    const partnerId = Number(created.value);
    const invoiceId = await postedInvoiceFor(partnerId, 80);

    const result = await customers.recordPayment(String(invoiceId), receipt(3000));
    expect(isOk(result)).toBe(true);

    const after = await readInvoice(invoiceId);
    // 80.00 owed, 30.00 paid, 50.00 left. The portal does not offer partial
    // payment, but the adapter must not silently clear the whole invoice if it
    // is ever handed a smaller amount.
    expect(toMinorUnits(after.amount_residual)).toBe(5000);
    expect(after.payment_state).toBe('partial');
  }, 180_000);

  it('reports a failure rather than throwing when the invoice does not exist', async () => {
    const result = await customers.recordPayment('99999999', receipt(1000));
    expect(isOk(result)).toBe(false);
  }, 60_000);
});
