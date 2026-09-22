import Link from 'next/link';
import { currentSession } from '@/auth/require';

/**
 * The primary navigation.
 *
 * It reads the session, which is why it lives here rather than as a constant in
 * the layout. Before increment 1D the list was a fixed array, so a signed-in
 * customer was offered "Sign in" and could only sign out from the dashboard,
 * and one entry pointed at `/support`, a route that has never existed and
 * returned 404 from every page since the shell was built.
 *
 * Reading the session cookie makes every route dynamic, including `/` and
 * `/join`, which were previously prerendered. That is accepted deliberately:
 * the alternative is a second, JavaScript-readable copy of the authentication
 * state, and the session cookie is `HttpOnly` on purpose.
 *
 * The markup is a `details` disclosure. Below 720px it is a menu the customer
 * opens; above it, CSS hides the summary and shows the list, so there is one
 * markup for both and no JavaScript in either.
 */
export default async function Nav() {
  const user = await currentSession();

  const items = user
    ? [
        { href: '/', label: 'Home' },
        { href: '/plans', label: 'Plans' },
        { href: '/account', label: 'My account' },
        { href: '/account/support', label: 'Support' },
      ]
    : [
        { href: '/', label: 'Home' },
        { href: '/plans', label: 'Plans' },
        { href: '/join', label: 'Open an account' },
        { href: '/signin', label: 'Sign in' },
      ];

  return (
    <nav className="vw-nav" aria-label="Main">
      <details className="vw-nav__disclosure">
        <summary className="vw-nav__toggle">Menu</summary>
        <ul className="vw-nav__list">
          {items.map((item) => (
            <li key={item.href}>
              <Link href={item.href}>{item.label}</Link>
            </li>
          ))}
          {user ? (
            <li>
              {/*
                Sign-out changes server state, so it is a POST. As a link it
                would be followed by a prefetch or a crawler and sign the
                customer out without them asking.
              */}
              <form method="post" action="/signout">
                <button className="vw-nav__signout" type="submit">
                  Sign out
                </button>
              </form>
            </li>
          ) : null}
        </ul>
      </details>
    </nav>
  );
}
