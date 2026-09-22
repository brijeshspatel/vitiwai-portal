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

const INSTRUMENTS: readonly string[] = ['pm_test_ok', 'pm_test_decline', 'pm_test_insufficient'];

export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = request.nextUrl.origin;
  const user = await currentSession();
  if (user === null) return NextResponse.redirect(new URL('/signin', origin), 303);

  const form = await request.formData();
  // Reject a forged request before anything is read from it.
  const forged = await rejectIfForged(form);
  if (forged) return forged;

  const invoiceId = String(form.get('invoiceId') ?? '');
  const amountMinor = Number(form.get('amountMinor') ?? 0);
  const idempotencyKey = String(form.get('idempotencyKey') ?? '');
  const instrument = String(form.get('instrument') ?? '');

  const back = (params: Record<string, string>) =>
    NextResponse.redirect(
      new URL(`/account/pay?${new URLSearchParams(params).toString()}`, origin),
      303,
    );

  if (!invoiceId || !idempotencyKey || !Number.isInteger(amountMinor) || amountMinor <= 0) {
    return back({ outcome: 'unavailable', reason: 'That payment request was not valid.' });
  }
  if (!INSTRUMENTS.includes(instrument)) {
    return back({ outcome: 'unavailable', reason: 'Choose one of the test cards.' });
  }

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
