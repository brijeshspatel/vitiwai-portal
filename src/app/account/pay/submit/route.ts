import { NextResponse, type NextRequest } from 'next/server';
import { loadEnv } from '@/config/env';
import { getPool } from '@/db/client';
import { getServices } from '@/composition';
import { currentSession } from '@/auth/require';
import { payInvoice } from '@/payments/pay';
import { sendReceipt } from '@/mail/send';
import type { Money } from '@/domain/money';
import type { TestInstrument } from '@/domain/types';
import { rejectIfForged } from '@/security/require-csrf';
import { paymentSchema } from '@/security/schemas';


export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = request.nextUrl.origin;
  const user = await currentSession();
  if (user === null) return NextResponse.redirect(new URL('/signin', origin), 303);

  const form = await request.formData();
  // Reject a forged request before anything is read from it.
  const forged = await rejectIfForged(form);
  if (forged) return forged;

  const back = (params: Record<string, string>) =>
    NextResponse.redirect(
      new URL(`/account/pay?${new URLSearchParams(params).toString()}`, origin),
      303,
    );

  // The schema replaces four hand-rolled checks and adds the ones they missed:
  // an upper bound, a fractional amount refused rather than truncated, and the
  // instrument constrained to the three the gateway understands.
  const parsed = paymentSchema.safeParse({
    invoiceId: form.get('invoiceId'),
    amountMinor: form.get('amountMinor'),
    instrument: form.get('instrument'),
    idempotencyKey: form.get('idempotencyKey'),
  });
  if (!parsed.success) {
    return back({ outcome: 'unavailable', reason: 'That payment request was not valid.' });
  }
  const { invoiceId, amountMinor, instrument, idempotencyKey } = parsed.data;

  const env = loadEnv();
  const outcome = await payInvoice(
    getServices(),
    getPool(env),
    (to, receiptId, amount, invoice) => sendReceipt(env, to, receiptId, amount, invoice),
    {
      idempotencyKey,
      userId: user.userId,
      invoiceId,
      amountMinor: amountMinor as Money,
      instrument: instrument as TestInstrument,
      email: user.email,
    },
  );

  if (outcome.kind === 'paid') {
    return back({
      outcome: 'paid',
      receipt: outcome.receiptId,
      amount: String(outcome.amountMinor),
    });
  }
  if (outcome.kind === 'declined') return back({ outcome: 'declined', reason: outcome.reason });
  if (outcome.kind === 'already_paid') return back({ outcome: 'already_paid' });
  return back({ outcome: 'unavailable', reason: outcome.message });
}
