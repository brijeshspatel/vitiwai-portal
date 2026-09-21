import { formatFJD } from '@/domain/money';
import type { Plan } from '@/domain/types';

export function PlanCard({ plan }: { plan: Plan }) {
  return (
    <article className="vw-card">
      <h3>{plan.name}</h3>
      <p className="vw-tag">{plan.category}</p>
      <p className="vw-price">
        {formatFJD(plan.monthlyPriceMinor)}
        <span className="vw-muted" style={{ fontSize: '0.9rem', fontWeight: 400 }}>
          {' '}
          per month
        </span>
      </p>
      <p className="vw-muted">{plan.description}</p>
      <ul className="vw-muted">
        {plan.includedKilolitres !== null && <li>{plan.includedKilolitres} kL water included</li>}
        {plan.downloadMbps !== null && <li>{plan.downloadMbps} Mbps download</li>}
      </ul>
    </article>
  );
}
