import { PlanCard } from '@/components/PlanCard';
import { getServices } from '@/composition';
import { isOk } from '@/domain/result';
import type { Plan } from '@/domain/types';

export const metadata = { title: 'Plans' };
export const dynamic = 'force-dynamic';

export default async function PlansPage() {
  const { search } = getServices();
  const result = await search.searchPlans({ limit: 24 });

  if (!isOk(result)) {
    return (
      <div className="vw-card vw-prose" role="alert">
        <h1>Plans are unavailable</h1>
        <p className="vw-error">{result.error.message}</p>
        <p className="vw-muted">
          The search service is part of the local stack. Try <code>npm run stack:up</code> and then{' '}
          <code>npm run seed</code>.
        </p>
      </div>
    );
  }

  const plans: readonly Plan[] = result.value.items;

  return (
    <>
      <div className="vw-card vw-prose">
        <h1>Plans</h1>
        <p className="vw-muted">
          {plans.length} plan{plans.length === 1 ? '' : 's'} available. Prices are in Fijian dollars
          per month.
        </p>
      </div>
      <div className="vw-grid">
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </div>
    </>
  );
}
