import { randomUUID } from 'node:crypto';
import { err, ok, type Result } from '@/domain/result';
import type { PaymentError, PaymentGatewayPort } from '@/ports/payment';
import type {
  IntentId,
  InvoiceId,
  PaymentIntent,
  PaymentReceipt,
  TestInstrument,
} from '@/domain/types';
import type { Money } from '@/domain/money';

/**
 * The SIMULATED gateway again, without the container.
 *
 * `MockGatewayAdapter` posts to a service that decides the outcome from the
 * instrument name. This makes the same decision in process, because a
 * demonstration should not run a container whose only job is to answer a
 * question the instrument already contains.
 *
 * It authorises nothing, settles nothing and touches no real money - and like
 * the other adapter, every intent and receipt it returns carries
 * `simulated: true`, so nothing downstream can lose track of what it is talking
 * to.
 *
 * Intents are held in memory. A demonstration is one process, and an intent
 * that outlived a restart would be an intent whose invoice may have been paid
 * by someone else in the meantime.
 */

interface HeldIntent {
  readonly id: IntentId;
  readonly amountMinor: Money;
  readonly reference: string;
  resolved: boolean;
}

export class DemoPaymentAdapter implements PaymentGatewayPort {
  private readonly intents = new Map<IntentId, HeldIntent>();

  async createIntent(
    amount: Money,
    reference: InvoiceId,
  ): Promise<Result<PaymentIntent, PaymentError>> {
    if (amount <= 0) {
      return err({
        kind: 'invalid_request',
        message: 'an intent must be for a positive amount',
      });
    }

    const id = `pi_demo_${randomUUID()}`;
    this.intents.set(id, { id, amountMinor: amount, reference, resolved: false });

    return ok({
      id,
      amountMinor: amount,
      reference,
      status: 'requires_confirmation',
      simulated: true,
    });
  }

  async confirmIntent(
    intent: IntentId,
    instrument: TestInstrument,
  ): Promise<Result<PaymentReceipt, PaymentError>> {
    const held = this.intents.get(intent);
    if (!held) {
      return err({ kind: 'not_found', message: `no intent ${intent}` });
    }
    // Confirming twice is the double-submit a customer produces by refreshing.
    // It is refused rather than quietly repeated, which is what makes the
    // idempotency key above this layer meaningful.
    if (held.resolved) {
      return err({ kind: 'already_resolved', message: `intent ${intent} is already resolved` });
    }
    held.resolved = true;

    if (instrument === 'pm_test_decline') {
      return err({ kind: 'declined', message: 'the card was declined' });
    }
    if (instrument === 'pm_test_insufficient') {
      return err({ kind: 'declined', message: 'there were insufficient funds' });
    }

    return ok({
      id: `rcpt_demo_${randomUUID()}`,
      intentId: intent,
      paidMinor: held.amountMinor,
      paidAt: new Date().toISOString(),
      simulated: true,
    });
  }
}
