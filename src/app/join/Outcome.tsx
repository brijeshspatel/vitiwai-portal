import { SimulatedNotice } from '@/components/SimulatedNotice';

export type OutcomeKind = 'approved' | 'referred' | 'declined';

/**
 * A referred applicant is told the general reason, not which field failed.
 *
 * Open item U7: naming the field would be friendlier, and it would also tell
 * somebody trying documents which one to change. The general reason is the
 * cautious default and is cheap to reverse.
 */
const GENERAL_REASON: Record<string, string> = {
  low_confidence: 'We could not read your document clearly enough.',
  name_mismatch: 'The details you gave do not match your document closely enough.',
  dob_mismatch: 'The details you gave do not match your document closely enough.',
  document_unreadable: 'We could not read your document.',
  document_number_mismatch: 'The details you gave do not match your document.',
};

function reasonText(reasons: readonly string[]): string {
  const unique = [...new Set(reasons.map((r) => GENERAL_REASON[r] ?? 'We could not verify your details.'))];
  return unique.join(' ');
}

export function Outcome({
  kind,
  reasons = [],
}: {
  kind: OutcomeKind;
  reasons?: readonly string[];
}) {
  if (kind === 'approved') {
    return (
      <div className="vw-card vw-prose">
        <h1>Your account is open</h1>
        <p>
          We have checked your document and opened your account. You can sign in once the account
          dashboard is available.
        </p>
        <SimulatedNotice what="the identity check">
          No identity bureau was consulted. The decision came from rules comparing what you typed
          against what was read from the document.
        </SimulatedNotice>
      </div>
    );
  }

  if (kind === 'referred') {
    return (
      <div className="vw-card vw-prose" role="status">
        <h1>We need to look at this by hand</h1>
        <p>{reasonText(reasons)}</p>
        <p>
          Someone will review your application and contact you. You do not need to do anything
          further.
        </p>
        <SimulatedNotice what="the identity check">
          No identity bureau was consulted. The decision came from rules comparing what you typed
          against what was read from the document.
        </SimulatedNotice>
      </div>
    );
  }

  return (
    <div className="vw-card vw-prose" role="alert">
      <h1>We could not open your account</h1>
      <p>{reasonText(reasons)}</p>
      <p>
        Check the details you entered and upload a clearer photograph of your document, then try
        again.
      </p>
      <SimulatedNotice what="the identity check">
        No identity bureau was consulted. The decision came from rules comparing what you typed
        against what was read from the document.
      </SimulatedNotice>
    </div>
  );
}
