import { randomBytes } from 'node:crypto';
import { requireSession } from '@/auth/require';
import { getServices } from '@/composition';
import { loadOverview } from '@/account/overview';
import { PayForm } from './PayForm';
import { PaymentOutcome } from './Outcome';
import { csrfToken } from '@/security/form';

export const metadata = { title: 'Pay your bill' };
export const dynamic = 'force-dynamic';

export default async function PayPage({
  searchParams,
}: {
  searchParams: Promise<{ invoice?: string; outcome?: string; receipt?: string; amount?: string; reason?: string }>;
}) {
  const user = await requireSession();
  const params = await searchParams;

  if (params.outcome) {
    const kind = params.outcome as 'paid' | 'declined' | 'already_paid' | 'unavailable';
    return (
      <PaymentOutcome
        kind={kind}
        amountMinor={params.amount ? (Number(params.amount) as never) : undefined}
        receiptId={params.receipt}
        reason={params.reason}
      />
    );
  }

  const overview = await loadOverview(getServices(), user.odooPartnerId);
  if (overview === null || overview.current === null) {
    return (
      <div className="vw-card vw-prose">
        <h1>Nothing to pay</h1>
        <p>You have no unpaid bills.</p>
        <p>
          <a className="vw-button" href="/account">
            Back to my account
          </a>
        </p>
      </div>
    );
  }

  const invoice =
    params.invoice && overview.invoices.find((i) => i.id === params.invoice)
      ? overview.invoices.find((i) => i.id === params.invoice)!
      : overview.current;

  return (
    <PayForm
      csrfToken={await csrfToken()}
      invoiceId={invoice.id}
      reference={invoice.reference}
      amountMinor={invoice.dueMinor}
      // Generated per page load. Two submissions of the same page carry the
      // same key, so the second returns the first result rather than paying.
      idempotencyKey={randomBytes(18).toString('base64url')}
    />
  );
}
