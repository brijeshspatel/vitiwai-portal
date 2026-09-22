import { requireSession } from '@/auth/require';
import { getServices } from '@/composition';
import { isOk } from '@/domain/result';
import { formatFJD } from '@/domain/money';
import { CsrfField } from '@/security/form';

export const metadata = { title: 'Change your plan' };
export const dynamic = 'force-dynamic';

export default async function ChangePlanPage({
  searchParams,
}: {
  searchParams: Promise<{ requested?: string; error?: string }>;
}) {
  await requireSession();
  const params = await searchParams;
  const result = await getServices().search.searchPlans({ limit: 24 });
  const plans = isOk(result) ? result.value.items : [];

  return (
    <>
      {params.requested !== undefined && (
        <p className="vw-card" role="status">
          Thank you. We have passed your request to our team and they will be in touch.
        </p>
      )}
      {params.error !== undefined && (
        <p className="vw-error" role="alert">
          {params.error}
        </p>
      )}

      <form className="vw-card" method="post" action="/account/change-plan/submit">
        <CsrfField />
        <h1>Change your plan</h1>
        <p className="vw-muted vw-prose">
          Choose the plan you would like. Nothing changes straight away; somebody will confirm it
          with you first.
        </p>

        {plans.length === 0 ? (
          <p className="vw-error" role="alert">
            We cannot list the plans just now, so a change cannot be requested.
          </p>
        ) : (
          <>
            <p>
              <label htmlFor="planId">Plan</label>
              <br />
              <select id="planId" name="planId" required defaultValue="">
                <option value="" disabled>
                  Choose a plan
                </option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} - {formatFJD(plan.monthlyPriceMinor)} per month
                  </option>
                ))}
              </select>
            </p>
            <p>
              <button className="vw-button" type="submit">
                Request this plan
              </button>
            </p>
          </>
        )}
      </form>
    </>
  );
}
