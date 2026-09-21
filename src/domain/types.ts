/**
 * The portal's own vocabulary.
 *
 * These types are the application's, not Odoo's. An adapter translates; nothing
 * above the adapter layer knows that a customer is an Odoo `res.partner` or
 * that a fault report is a `project.task`.
 */

import type { Money } from './money';

export type CustomerId = string;
export type InvoiceId = string;
export type CaseId = string;
export type LeadId = string;
export type PlanId = string;
export type IntentId = string;

export interface Customer {
  readonly id: CustomerId;
  readonly name: string;
  readonly email: string;
  readonly phone: string | null;
  readonly city: string | null;
  readonly balanceMinor: Money;
}

export interface NewCustomer {
  readonly name: string;
  readonly email: string;
  readonly phone?: string;
  readonly city?: string;
  readonly street?: string;
}

export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'cancelled';

export interface Invoice {
  readonly id: InvoiceId;
  /**
   * Null while the invoice is a draft. Odoo reports `name: false` in that
   * state, and rendering the raw value puts the string "false" in front of a
   * customer.
   */
  readonly reference: string | null;
  readonly status: InvoiceStatus;
  readonly totalMinor: Money;
  readonly dueMinor: Money;
  readonly dueDate: string | null;
}

export interface UsagePoint {
  readonly month: string;
  readonly kilolitres: number;
  readonly costMinor: Money;
}

export interface Plan {
  readonly id: PlanId;
  readonly name: string;
  readonly category: 'water' | 'broadband' | 'bundle';
  readonly monthlyPriceMinor: Money;
  readonly includedKilolitres: number | null;
  readonly downloadMbps: number | null;
  readonly description: string;
}

export interface PlanQuery {
  readonly text?: string;
  readonly category?: Plan['category'];
  readonly maxMonthlyPriceMinor?: Money;
  readonly limit?: number;
  readonly offset?: number;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
}

export type CaseStatus = 'new' | 'in_progress' | 'resolved' | 'cancelled';

export interface SupportCase {
  readonly id: CaseId;
  readonly title: string;
  readonly description: string;
  readonly status: CaseStatus;
  readonly createdAt: string;
}

export interface NewCase {
  readonly customerId: CustomerId;
  readonly title: string;
  readonly description: string;
}

export interface NewLead {
  readonly customerId: CustomerId;
  readonly title: string;
  readonly requestedPlanId: PlanId;
}

export interface PaymentIntent {
  readonly id: IntentId;
  readonly amountMinor: Money;
  readonly reference: string;
  readonly status: 'requires_confirmation' | 'succeeded' | 'declined';
  /** Always true in phase 1. The gateway is simulated. */
  readonly simulated: boolean;
}

export interface PaymentReceipt {
  readonly id: string;
  readonly intentId: IntentId;
  readonly paidMinor: Money;
  readonly paidAt: string;
  readonly simulated: boolean;
}

export type TestInstrument = 'pm_test_ok' | 'pm_test_decline' | 'pm_test_insufficient';

export interface UploadedFile {
  readonly filename: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

export interface ExtractedDocument {
  readonly rawText: string;
  readonly documentNumber: string | null;
  readonly fullName: string | null;
  readonly dateOfBirth: string | null;
  readonly confidence: number;
}

export interface ClaimedIdentity {
  readonly fullName: string;
  readonly dateOfBirth: string;
  readonly documentNumber: string;
}

export type ReferralReason = 'low_confidence' | 'name_mismatch' | 'dob_mismatch';
export type DeclineReason = 'document_unreadable' | 'document_number_mismatch';

export type IdentityOutcome =
  | { readonly kind: 'approved'; readonly matchedFields: readonly string[] }
  | { readonly kind: 'referred'; readonly reasons: readonly ReferralReason[] }
  | { readonly kind: 'declined'; readonly reasons: readonly DeclineReason[] };
