import type { ClaimedIdentity, ExtractedDocument, IdentityOutcome } from '@/domain/types';

/**
 * Decides whether a claimed identity matches the document that was read.
 *
 * SIMULATED, permanently in this project. It compares fields and applies
 * thresholds; it consults no identity bureau, and a real deployment would
 * replace it. Implemented in increment 1B.
 *
 * It returns an outcome rather than a Result: a decline is an answer, not a
 * failure of the port.
 */
export interface IdentityDecisionPort {
  decide(claimed: ClaimedIdentity, extracted: ExtractedDocument): Promise<IdentityOutcome>;
}
