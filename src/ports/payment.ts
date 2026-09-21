import type { PortError, Result } from '@/domain/result';
import type {
  IntentId, InvoiceId, PaymentIntent, PaymentReceipt, TestInstrument,
} from '@/domain/types';
import type { Money } from '@/domain/money';

export type PaymentErrorKind =
  | 'declined' | 'not_found' | 'already_resolved' | 'unavailable' | 'invalid_request';
export type PaymentError = PortError<PaymentErrorKind>;

/**
 * Intent-and-confirm, shaped like a real provider's API.
 *
 * Phase 1 binds this to a simulated gateway. The shape is what makes phase 2 a
 * configuration change: swapping the adapter, not rewriting the checkout.
 */
export interface PaymentGatewayPort {
  createIntent(amount: Money, reference: InvoiceId): Promise<Result<PaymentIntent, PaymentError>>;
  confirmIntent(
    intent: IntentId,
    instrument: TestInstrument,
  ): Promise<Result<PaymentReceipt, PaymentError>>;
}
