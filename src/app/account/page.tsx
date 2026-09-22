import { requireSession } from '@/auth/require';

export const metadata = { title: 'My account' };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const user = await requireSession();
  return (
    <div className="vw-card vw-prose">
      <h1>My account</h1>
      <p>
        Signed in as <strong>{user.email}</strong>.
      </p>
      <p className="vw-muted">
        Your balance, current invoice and usage history arrive with the next boundary of this
        increment.
      </p>
      <form method="post" action="/signout">
        <button className="vw-button" type="submit">
          Sign out
        </button>
      </form>
    </div>
  );
}
