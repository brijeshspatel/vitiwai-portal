import { err, ok, type Result } from '@/domain/result';
import type { PaymentError, PaymentGatewayPort } from '@/ports/payment';
import type { IntentId, InvoiceId, PaymentIntent, PaymentReceipt, TestInstrument } from '@/domain/types';
import type { Money } from '@/domain/money';

/**
 * The SIMULATED payment gateway.
 *
 * It authorises nothing, settles nothing and touches no real money. It exists
 * so that checkout is written against an intent-and-confirm API shaped like a
 * real provider's, which is what makes substituting a live test account in
 * phase 2 a change to this file and `composition.ts` rather than a rewrite of
 * the flow.
 *
 * Every response the service returns carries `simulated: true`, and this
 * adapter propagates it rather than dropping it, so nothing downstream can
 * lose track of what it is talking to.
 */

interface IntentResponse {
  intent: {
    id: string;
    amountMinor: number;
    currency: string;
    reference: string;
    status: 'requires_confirmation' | 'succeeded' | 'declined';
    declineReason?: string;
    receipt?: { id: string; paidAtMinor: number; paidAt: string };
  };
  simulated: boolean;
}

interface ErrorResponse {
  error: string;
  message?: string;
  reason?: string;
  simulated: boolean;
}

export class MockGatewayAdapter implements PaymentGatewayPort {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 15_000,
  ) {}

  private async post<T>(path: string, body: unknown): Promise<Result<T, PaymentError>> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      return err({
        kind: 'unavailable',
        message: `the payment gateway did not answer at ${this.baseUrl}`,
        cause,
      });
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch (cause) {
      return err({ kind: 'unavailable', message: 'the gateway returned invalid JSON', cause });
    }

    if (response.ok) return ok(parsed as T);

    const failure = parsed as ErrorResponse;
    if (response.status === 402) {
      return err({
        kind: 'declined',
        message: failure.reason ?? 'the payment was declined',
      });
    }
    if (response.status === 404) {
      return err({ kind: 'not_found', message: 'no such payment intent' });
    }
    if (response.status === 409) {
      return err({ kind: 'already_resolved', message: failure.message ?? 'already resolved' });
    }
    if (response.status === 400) {
      return err({ kind: 'invalid_request', message: failure.message ?? 'invalid request' });
    }
    return err({
      kind: 'unavailable',
      message: `the gateway returned HTTP ${response.status}`,
    });
  }

  async createIntent(
    amount: Money,
    reference: InvoiceId,
  ): Promise<Result<PaymentIntent, PaymentError>> {
    const result = await this.post<IntentResponse>('/v1/intents', {
      amountMinor: amount,
      reference,
    });
    if (!result.ok) return result;

    const { intent, simulated } = result.value;
    return ok({
      id: intent.id,
      amountMinor: intent.amountMinor as Money,
      reference: intent.reference,
      status: intent.status,
      simulated,
    });
  }

  async confirmIntent(
    intent: IntentId,
    instrument: TestInstrument,
  ): Promise<Result<PaymentReceipt, PaymentError>> {
    const result = await this.post<IntentResponse>(
      `/v1/intents/${encodeURIComponent(intent)}/confirm`,
      { instrument },
    );
    if (!result.ok) return result;

    const { intent: confirmed, simulated } = result.value;
    if (confirmed.status !== 'succeeded' || !confirmed.receipt) {
      return err({
        kind: 'declined',
        message: confirmed.declineReason ?? 'the payment did not succeed',
      });
    }

    return ok({
      id: confirmed.receipt.id,
      intentId: confirmed.id,
      paidMinor: confirmed.receipt.paidAtMinor as Money,
      paidAt: confirmed.receipt.paidAt,
      simulated,
    });
  }
}
