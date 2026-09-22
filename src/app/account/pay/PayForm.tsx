import { formatFJD, type Money } from '@/domain/money';
import { SimulatedNotice } from '@/components/SimulatedNotice';

/** The three instruments the simulated gateway understands. */
export const INSTRUMENTS = [
  { value: 'pm_test_ok', label: 'Test card that succeeds' },
  { value: 'pm_test_decline', label: 'Test card that is declined' },
  { value: 'pm_test_insufficient', label: 'Test card with insufficient funds' },
] as const;

export function PayForm({
  invoiceId,
  reference,
  amountMinor,
  idempotencyKey,
  error,
}: {
  invoiceId: string;
  reference: string | null;
  amountMinor: Money;
  idempotencyKey: string;
  error?: string;
}) {
  return (
    <>
      <SimulatedNotice what="this payment">
        No money moves. The gateway is a local simulation and the cards below are the only ones it
        understands. Never enter real card details anywhere in this demonstration.
      </SimulatedNotice>

      <form className="vw-card" method="post" action="/account/pay/submit">
        <h1>Pay your bill</h1>

        {error !== undefined && (
          <p className="vw-error" role="alert">
            {error}
          </p>
        )}

        <dl>
          <dt>Invoice</dt>
          <dd>{reference ?? 'Not yet issued'}</dd>
          <dt>Amount due</dt>
          <dd className="vw-price">{formatFJD(amountMinor)}</dd>
        </dl>

        <input type="hidden" name="invoiceId" value={invoiceId} />
        <input type="hidden" name="amountMinor" value={String(amountMinor)} />
        {/*
          Generated once when this page was rendered. Submitting the same page
          twice sends the same key, and the second submission returns the first
          result instead of paying again.
        */}
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

        <fieldset>
          <legend>Choose a test card</legend>
          {INSTRUMENTS.map((instrument, index) => (
            <p key={instrument.value}>
              <input
                type="radio"
                id={instrument.value}
                name="instrument"
                value={instrument.value}
                defaultChecked={index === 0}
                required
              />{' '}
              <label htmlFor={instrument.value}>{instrument.label}</label>
            </p>
          ))}
        </fieldset>

        <p>
          <button className="vw-button" type="submit">
            Pay {formatFJD(amountMinor)}
          </button>
        </p>
      </form>
    </>
  );
}
