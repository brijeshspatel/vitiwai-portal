import { requireSession } from '@/auth/require';
import { getServices } from '@/composition';
import { loadOverview } from '@/account/overview';
import { AccountSummary } from './AccountSummary';
import { UsageTable } from './UsageTable';

export const metadata = { title: 'My account' };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const user = await requireSession();
  const overview = await loadOverview(getServices(), user.odooPartnerId);

  if (overview === null) {
    return (
      <div className="vw-card vw-prose" role="alert">
        <h1>Your account is unavailable</h1>
        <p>We cannot reach the account system at the moment. Please try again shortly.</p>
      </div>
    );
  }

  return (
    <>
      <div className="vw-card vw-prose">
        <h1>My account</h1>
        <p className="vw-muted">
          Signed in as {user.email}.{' '}
          <form method="post" action="/signout" style={{ display: 'inline' }}>
            <button className="vw-linkish" type="submit">
              Sign out
            </button>
          </form>
        </p>
      </div>

      {overview.unavailable.length > 0 && (
        <p className="vw-error" role="status">
          We could not load {overview.unavailable.join(' or ')}. Everything else is up to date.
        </p>
      )}

      <AccountSummary balanceMinor={overview.balanceMinor} current={overview.current} />
      <UsageTable points={overview.usage} />
    </>
  );
}
