import { JoinForm } from './JoinForm';
import { Outcome, type OutcomeKind } from './Outcome';
import { SimulatedNotice } from '@/components/SimulatedNotice';
import { csrfToken } from '@/security/form';
import { loadEnv } from '@/config/env';

export const metadata = { title: 'Open an account' };

const OUTCOMES: readonly OutcomeKind[] = ['approved', 'referred', 'declined'];

/**
 * The form, or the outcome of having sent it.
 *
 * The handler at /join/submit redirects back here with the result in the query
 * string, so a refresh re-reads an outcome instead of re-applying.
 */
export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ outcome?: string; reasons?: string; error?: string }>;
}) {
  const params = await searchParams;
  const acceptsDocument = !loadEnv().DEMO_MODE;
  const outcome = OUTCOMES.find((k) => k === params.outcome);

  if (outcome) {
    const reasons = params.reasons ? params.reasons.split(',').filter(Boolean) : [];
    return <Outcome kind={outcome} reasons={reasons} />;
  }

  return (
    <>
      <SimulatedNotice what="identity verification">
        {acceptsDocument
          ? 'This is a demonstration. Upload only the specimen documents this project generates. Never upload a real identity document.'
          : 'This is a demonstration and it accepts no identity documents at all. Nothing you could attach would be read.'}
      </SimulatedNotice>
      <JoinForm
        error={params.error}
        csrfToken={await csrfToken()}
        acceptsDocument={acceptsDocument}
      />
    </>
  );
}
