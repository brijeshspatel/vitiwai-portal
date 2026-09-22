import { formatFJD } from '@/domain/money';
import type { Invoice } from '@/domain/types';
import type { Money } from '@/domain/money';
import { formatDate } from '@/domain/dates';

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
            {/*
              The amount is the headline above this list. Repeating it here as
              "Amount" made the card state the same figure twice, which invites
              the reader to look for the difference between them.
            */}
            <dt>Due</dt>
            <dd>{current.dueDate ? formatDate(current.dueDate) : 'No date set'}</dd>
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
