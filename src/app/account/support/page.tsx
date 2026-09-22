import { requireSession } from '@/auth/require';
import { getServices } from '@/composition';
import { isOk } from '@/domain/result';
import type { SupportCase } from '@/domain/types';

export const metadata = { title: 'Support' };
export const dynamic = 'force-dynamic';

/**
 * Odoo's own task states, in the customer's language.
 *
 * The portal's four-value vocabulary maps onto `project.task.state`, which has
 * no `new`: a freshly created task is `01_in_progress`. An agent changing the
 * state in Odoo changes what appears here, with no code change.
 */
const STATUS_LABEL: Record<SupportCase['status'], string> = {
  waiting: 'Waiting',
  in_progress: 'Being worked on',
  resolved: 'Resolved',
  cancelled: 'Cancelled',
};

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ raised?: string; error?: string }>;
}) {
  const user = await requireSession();
  const params = await searchParams;
  const listed = await getServices().cases.listCases(user.odooPartnerId);
  const cases: readonly SupportCase[] = isOk(listed) ? listed.value : [];

  return (
    <>
      {params.raised !== undefined && (
        <p className="vw-card" role="status">
          Thank you. We have logged your report and somebody will look at it.
        </p>
      )}
      {params.error !== undefined && (
        <p className="vw-error" role="alert">
          {params.error}
        </p>
      )}

      <form className="vw-card" method="post" action="/account/support/submit">
        <h1>Report a fault</h1>
        <p className="vw-muted vw-prose">
          Tell us what is wrong and we will raise it with our operations team.
        </p>
        <p>
          <label htmlFor="title">What is the problem?</label>
          <br />
          <input id="title" name="title" type="text" required maxLength={120} />
        </p>
        <p>
          <label htmlFor="description">Anything else we should know?</label>
          <br />
          <textarea id="description" name="description" rows={4} maxLength={2000} />
        </p>
        <p>
          <button className="vw-button" type="submit">
            Report it
          </button>
        </p>
      </form>

      <div className="vw-card">
        <h2>Your reports</h2>
        {!isOk(listed) && (
          <p className="vw-error" role="alert">
            We could not load your reports just now.
          </p>
        )}
        {isOk(listed) && cases.length === 0 && (
          <p className="vw-muted">You have not reported anything yet.</p>
        )}
        {cases.length > 0 && (
          <table className="vw-table">
            <caption>Faults you have reported, most recent first.</caption>
            <thead>
              <tr>
                <th scope="col">What</th>
                <th scope="col">Status</th>
                <th scope="col">Reported</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((supportCase) => (
                <tr key={supportCase.id}>
                  <th scope="row">{supportCase.title}</th>
                  <td>{STATUS_LABEL[supportCase.status]}</td>
                  <td>{supportCase.createdAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
