import { PlanCard } from '@/components/PlanCard';
import { PlanFilters } from './PlanFilters';
import { getServices } from '@/composition';
import { isOk } from '@/domain/result';
import { toMinorUnits } from '@/domain/money';
import type { Plan, PlanQuery } from '@/domain/types';

export const metadata = { title: 'Plans' };
export const dynamic = 'force-dynamic';

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; maxPrice?: string }>;
}) {
  const params = await searchParams;
  const { search } = getServices();

  const query: PlanQuery = {
    limit: 24,
    ...(params.q ? { text: params.q } : {}),
    ...(params.category ? { category: params.category as Plan['category'] } : {}),
    ...(params.maxPrice && Number.isFinite(Number(params.maxPrice))
      ? { maxMonthlyPriceMinor: toMinorUnits(Number(params.maxPrice)) }
      : {}),
  };

  const result = await search.searchPlans(query);

  if (!isOk(result)) {
    return (
      <>
        <PlanFilters text={params.q} category={params.category} maxPrice={params.maxPrice} />
        <div className="vw-card vw-prose" role="alert">
          <h1>Plans are unavailable</h1>
          <p className="vw-error">{result.error.message}</p>
          <p className="vw-muted">
            The search service is part of the local stack. Try <code>npm run stack:up</code> and
            then <code>npm run seed</code>.
          </p>
        </div>
      </>
    );
  }

  const plans: readonly Plan[] = result.value.items;
  const filtered = Boolean(params.q || params.category || params.maxPrice);

  return (
    <>
      <div className="vw-card vw-prose">
        <h1>Plans</h1>
        <p className="vw-muted">
          {plans.length} plan{plans.length === 1 ? '' : 's'}
          {filtered ? ' match your search' : ' available'}. Prices are in Fijian dollars per month.
        </p>
      </div>

      <PlanFilters text={params.q} category={params.category} maxPrice={params.maxPrice} />

      {plans.length === 0 ? (
        <div className="vw-card vw-prose" role="status">
          <h2>Nothing matched</h2>
          <p>No plan matches that search. Try a higher price, or a different category.</p>
          <p>
            <a href="/plans">Show every plan</a>
          </p>
        </div>
      ) : (
        <div className="vw-grid">
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>
      )}
    </>
  );
}
