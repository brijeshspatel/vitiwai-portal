import type { IdentityDecisionPort } from '@/ports/identity';
import type {
  ClaimedIdentity,
  ExtractedDocument,
  IdentityOutcome,
  ReferralReason,
} from '@/domain/types';
import { nameSimilarity } from '@/domain/similarity';

/**
 * SIMULATED identity verification.
 *
 * This consults no identity bureau, no sanctions list and no credit file. It
 * compares what the applicant typed against what was read from their document
 * and applies thresholds. A real deployment would replace this adapter
 * entirely; that is the whole reason it sits behind a port.
 *
 * It returns an outcome rather than a Result, because a decline is an answer
 * and not a failure of the port.
 */

/** Below this, nothing read can be trusted at all. */
export const CONFIDENCE_DECLINE_BELOW = 0.3;
/** Between the two, something was read but not well enough to act on. */
export const CONFIDENCE_REFER_BELOW = 0.6;
/** At or above this, the two names are the same name. */
export const NAME_APPROVE_AT = 0.85;
/** Below this, they are different names rather than a slip of the pen. */
export const NAME_DECLINE_BELOW = 0.6;

const sameNumber = (a: string, b: string) =>
  a.replace(/\s/g, '').toUpperCase() === b.replace(/\s/g, '').toUpperCase();

export class RulesIdentityAdapter implements IdentityDecisionPort {
  async decide(claimed: ClaimedIdentity, extracted: ExtractedDocument): Promise<IdentityOutcome> {
    // 1. Nothing usable was read. There is nothing to compare against.
    if (extracted.confidence < CONFIDENCE_DECLINE_BELOW) {
      return { kind: 'declined', reasons: ['document_unreadable'] };
    }

    // 2. A document number that was read and does not match is a different
    //    document, not a transcription slip. Checked before the confidence
    //    band, because a wrong number is conclusive at any confidence.
    if (extracted.documentNumber !== null && !sameNumber(claimed.documentNumber, extracted.documentNumber)) {
      return { kind: 'declined', reasons: ['document_number_mismatch'] };
    }

    // 3. Something was read, but not well enough to rely on. The fields are
    //    unreliable here by definition, so no further comparison is made -
    //    comparing a claimed name against a field OCR could not read would
    //    decline an applicant for the reader's failure rather than their own.
    if (extracted.confidence < CONFIDENCE_REFER_BELOW) {
      return { kind: 'referred', reasons: ['low_confidence'] };
    }

    // 4. Confident, but a field did not parse. A human should look rather than
    //    the applicant being turned away.
    if (extracted.documentNumber === null || extracted.fullName === null) {
      return { kind: 'referred', reasons: ['low_confidence'] };
    }

    // 5. Names.
    const similarity = nameSimilarity(claimed.fullName, extracted.fullName);
    if (similarity < NAME_DECLINE_BELOW) {
      return { kind: 'declined', reasons: ['name_mismatch'] };
    }

    const referrals: ReferralReason[] = [];
    if (similarity < NAME_APPROVE_AT) referrals.push('name_mismatch');

    // 6. Date of birth, when it was read.
    if (extracted.dateOfBirth !== null && extracted.dateOfBirth !== claimed.dateOfBirth) {
      referrals.push('dob_mismatch');
    }

    if (referrals.length > 0) return { kind: 'referred', reasons: referrals };

    return { kind: 'approved', matchedFields: ['documentNumber', 'fullName', 'dateOfBirth'] };
  }
}
