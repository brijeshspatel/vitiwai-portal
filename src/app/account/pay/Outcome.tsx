import { formatFJD, type Money } from '@/domain/money';
import { SimulatedNotice } from '@/components/SimulatedNotice';

export function PaymentOutcome({
  kind,
  amountMinor,
  receiptId,
  reason,
}: {
  kind: 'paid' | 'declined' | 'already_paid' | 'unavailable';
  amountMinor?: Money;
  receiptId?: string;
  reason?: string;
}) {
  if (kind === 'paid') {
    return (
      <div className="vw-card vw-prose">
        <h1>Thank you, that is paid</h1>
        <p>
          We received {amountMinor !== undefined ? formatFJD(amountMinor) : 'your payment'}. Your
          receipt number is <strong>{receiptId}</strong>, and we have emailed it to you.
        </p>
        <SimulatedNotice what="this payment">
          No money moved. The gateway is a local simulation.
        </SimulatedNotice>
        <p>
          <a className="vw-button" href="/account">
            Back to my account
          </a>
        </p>
      </div>
    );
  }

  if (kind === 'already_paid') {
    return (
      <div className="vw-card vw-prose" role="status">
        <h1>That bill is already paid</h1>
        <p>We have not taken a second payment. Nothing further is owed on this invoice.</p>
        <p>
          <a className="vw-button" href="/account">
            Back to my account
          </a>
        </p>
      </div>
    );
  }

  if (kind === 'declined') {
    return (
      <div className="vw-card vw-prose" role="alert">
        <h1>That payment was declined</h1>
        <p>{reason ?? 'The card was declined.'}</p>
        <p>Nothing has been charged and your balance is unchanged. You can try another card.</p>
        <p>
          <a className="vw-button" href="/account">
            Back to my account
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="vw-card vw-prose" role="alert">
      <h1>We could not take the payment</h1>
      <p>{reason ?? 'The payment service is not responding.'}</p>
      <p>Nothing has been charged. Please try again shortly.</p>
    </div>
  );
}
