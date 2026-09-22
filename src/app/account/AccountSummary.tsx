import { formatFJD } from '@/domain/money';
import type { Invoice } from '@/domain/types';
import type { Money } from '@/domain/money';

/** What is owed, and the bill it comes from. */
export function AccountSummary({
  balanceMinor,
  current,
}: {
  balanceMinor: Money;
  current: Invoice | null;
}) {
  return (
    <div className="vw-card">
      <h2>What you owe</h2>
      <p className="vw-price">{formatFJD(balanceMinor)}</p>

      {current === null ? (
        <p className="vw-muted">
          You have no unpaid bills. Your next one appears here when it is issued.
        </p>
      ) : (
        <>
          <dl>
            <dt>Invoice</dt>
            {/* C3: a draft invoice reports `name: false`; never render that. */}
            <dd>{current.reference ?? 'Not yet issued'}</dd>
            <dt>Amount</dt>
            <dd>{formatFJD(current.dueMinor)}</dd>
            <dt>Due</dt>
            <dd>{current.dueDate ?? 'No date set'}</dd>
          </dl>
          {balanceMinor > 0 && (
            <p>
              <a className="vw-button" href={`/account/pay?invoice=${current.id}`}>
                Pay this bill
              </a>
            </p>
          )}
        </>
      )}
    </div>
  );
}
