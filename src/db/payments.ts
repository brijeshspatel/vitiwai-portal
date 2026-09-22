import type pg from 'pg';
import type { Money } from '@/domain/money';

/**
 * The payment record.
 *
 * Two mechanisms stop a customer paying twice, and they fail differently:
 * the unique idempotency key catches a repeated request, and the partial
 * unique index on (invoice_id) where status = 'succeeded' catches everything
 * else - two tabs, two keys, one invoice.
 */

export type PaymentStatus = 'succeeded' | 'declined';

export interface PaymentRow {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly invoiceId: string;
  readonly amountMinor: Money;
  readonly status: PaymentStatus;
  readonly receiptId: string | null;
  readonly declineReason: string | null;
}

interface RawRow {
  id: string;
  idempotency_key: string;
  invoice_id: string;
  amount_minor: string;
  status: PaymentStatus;
  receipt_id: string | null;
  decline_reason: string | null;
}

const toRow = (r: RawRow): PaymentRow => ({
  id: String(r.id),
  idempotencyKey: r.idempotency_key,
  invoiceId: r.invoice_id,
  // BIGINT arrives as a string from pg; Number is exact well past any bill.
  amountMinor: Number(r.amount_minor) as Money,
  status: r.status,
  receiptId: r.receipt_id,
  declineReason: r.decline_reason,
});

export async function findByIdempotencyKey(
  pool: pg.Pool,
  key: string,
): Promise<PaymentRow | null> {
  const result = await pool.query(
    `SELECT id, idempotency_key, invoice_id, amount_minor, status, receipt_id, decline_reason
       FROM payment WHERE idempotency_key = $1`,
    [key],
  );
  const row = result.rows[0] as RawRow | undefined;
  return row ? toRow(row) : null;
}

export async function findSucceededForInvoice(
  pool: pg.Pool,
  invoiceId: string,
): Promise<PaymentRow | null> {
  const result = await pool.query(
    `SELECT id, idempotency_key, invoice_id, amount_minor, status, receipt_id, decline_reason
       FROM payment WHERE invoice_id = $1 AND status = 'succeeded'`,
    [invoiceId],
  );
  const row = result.rows[0] as RawRow | undefined;
  return row ? toRow(row) : null;
}

export async function recordPaymentRow(
  pool: pg.Pool,
  input: {
    idempotencyKey: string;
    userId: string;
    invoiceId: string;
    amountMinor: number;
    status: PaymentStatus;
    intentId?: string | null;
    receiptId?: string | null;
    declineReason?: string | null;
  },
): Promise<PaymentRow> {
  const result = await pool.query(
    `INSERT INTO payment
       (idempotency_key, user_id, invoice_id, amount_minor, status, intent_id, receipt_id, decline_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, idempotency_key, invoice_id, amount_minor, status, receipt_id, decline_reason`,
    [
      input.idempotencyKey,
      input.userId,
      input.invoiceId,
      input.amountMinor,
      input.status,
      input.intentId ?? null,
      input.receiptId ?? null,
      input.declineReason ?? null,
    ],
  );
  return toRow(result.rows[0] as RawRow);
}

/** Postgres unique-violation. Either guard firing lands here. */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}
