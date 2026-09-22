import type pg from 'pg';
import { isErr, isOk } from '@/domain/result';
import {
  findByIdempotencyKey,
  findSucceededForInvoice,
  isUniqueViolation,
  recordPaymentRow,
  type PaymentRow,
} from '@/db/payments';
import type { Services } from '@/composition';
import type { TestInstrument } from '@/domain/types';
import type { Money } from '@/domain/money';

/**
 * Paying a bill.
 *
 * The order of operations is the whole design. The record is written **before**
 * Odoo is told, so a payment can never be taken and then be invisible: if the
 * ERP call fails afterwards, the row still exists and reconciliation has
 * something to find. The opposite order can lose money silently.
 */

export type PayOutcome =
  | { readonly kind: 'paid'; readonly receiptId: string; readonly amountMinor: Money; readonly replayed: boolean }
  | { readonly kind: 'declined'; readonly reason: string }
  | { readonly kind: 'already_paid' }
  | { readonly kind: 'unavailable'; readonly message: string };

export interface PayInput {
  readonly idempotencyKey: string;
  readonly userId: string;
  readonly invoiceId: string;
  readonly amountMinor: Money;
  readonly instrument: TestInstrument;
  readonly email: string;
}

const asOutcome = (row: PaymentRow, replayed: boolean): PayOutcome =>
  row.status === 'succeeded'
    ? { kind: 'paid', receiptId: row.receiptId ?? '', amountMinor: row.amountMinor, replayed }
    : { kind: 'declined', reason: row.declineReason ?? 'the payment was declined' };

export async function payInvoice(
  services: Services,
  pool: pg.Pool,
  sendReceipt: (to: string, receiptId: string, amountMinor: Money, invoiceId: string) => Promise<void>,
  input: PayInput,
): Promise<PayOutcome> {
  // 1. Has this exact request been seen? A refresh or a retry must not pay
  //    again; it must return what happened the first time.
  const seen = await findByIdempotencyKey(pool, input.idempotencyKey);
  if (seen) return asOutcome(seen, true);

  // 2. Has this invoice already been paid under some other key? Two tabs, two
  //    keys, one invoice - the case the key alone cannot catch.
  const already = await findSucceededForInvoice(pool, input.invoiceId);
  if (already) return { kind: 'already_paid' };

  // 3. Authorise.
  const intent = await services.payments.createIntent(input.amountMinor, input.invoiceId);
  if (isErr(intent)) {
    return { kind: 'unavailable', message: 'the payment service is not responding. Nothing was charged.' };
  }

  const confirmed = await services.payments.confirmIntent(intent.value.id, input.instrument);

  if (isErr(confirmed)) {
    if (confirmed.error.kind !== 'declined') {
      return { kind: 'unavailable', message: 'the payment service is not responding. Nothing was charged.' };
    }
    // A decline is recorded: a customer who tries three cards leaves a trail.
    try {
      await recordPaymentRow(pool, {
        idempotencyKey: input.idempotencyKey,
        userId: input.userId,
        invoiceId: input.invoiceId,
        amountMinor: input.amountMinor,
        status: 'declined',
        intentId: intent.value.id,
        declineReason: confirmed.error.message,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    return { kind: 'declined', reason: confirmed.error.message };
  }

  // 4. Record it before telling anybody. The database is the thing that must
  //    not lose the payment.
  let row: PaymentRow;
  try {
    row = await recordPaymentRow(pool, {
      idempotencyKey: input.idempotencyKey,
      userId: input.userId,
      invoiceId: input.invoiceId,
      amountMinor: input.amountMinor,
      status: 'succeeded',
      intentId: intent.value.id,
      receiptId: confirmed.value.id,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Another request won the race between step 2 and here. The index did
      // exactly what it exists for.
      const winner = await findSucceededForInvoice(pool, input.invoiceId);
      return winner ? { kind: 'already_paid' } : { kind: 'unavailable', message: 'the payment could not be recorded.' };
    }
    throw error;
  }

  // 5. Tell the ERP. A failure here leaves a recorded payment to reconcile,
  //    which is recoverable; the reverse would not be.
  const recorded = await services.customers.recordPayment(input.invoiceId, confirmed.value);
  if (!isOk(recorded)) {
    return {
      kind: 'paid',
      receiptId: row.receiptId ?? confirmed.value.id,
      amountMinor: row.amountMinor,
      replayed: false,
    };
  }

  // 6. The receipt is a courtesy. It must not fail the payment.
  try {
    await sendReceipt(input.email, confirmed.value.id, input.amountMinor, input.invoiceId);
  } catch {
    /* recorded and paid; the email is not worth failing for */
  }

  return { kind: 'paid', receiptId: confirmed.value.id, amountMinor: row.amountMinor, replayed: false };
}
