import { NextResponse, type NextRequest } from 'next/server';
// The names only. Importing from '@/security/csrf' would drag node:crypto
// into the Edge runtime and 500 every request.
import { CSRF_COOKIE, CSRF_HEADER } from '@/security/csrf-names';

/**
 * Two jobs, both of which have to happen before a page renders.
 *
 * **The CSRF token.** Minted here where one is absent, forwarded to the render
 * on a request header so a server component can write it into a form, and set
 * as a cookie on the way out. A server component cannot set a cookie itself,
 * which is why this cannot live in the page.
 *
 * **The redirect for signed-out visitors.** Comfort, not the control. It checks
 * only that a cookie is present - it cannot read the database - so it can be
 * fooled by any string. `requireSession()` is what actually decides, and every
 * /account route calls it. A route added later that forgets the guard must fail
 * closed on its own.
 */
export function middleware(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith('/account') && !request.cookies.has('vitiwai_session')) {
    const url = request.nextUrl.clone();
    url.pathname = '/signin';
    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  const existing = request.cookies.get(CSRF_COOKIE)?.value;
  // Web Crypto, not node:crypto: middleware runs on the Edge runtime, where
  // randomBytes does not exist.
  const token = existing ?? Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');

  const headers = new Headers(request.headers);
  headers.set(CSRF_HEADER, token);

  const response = NextResponse.next({ request: { headers } });

  if (!existing) {
    response.cookies.set(CSRF_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
    });
  }

  return response;
}

export const config = {
  // Every route, so a form on any page can carry a token. Static assets are
  // excluded because they render nothing and cannot host a form.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
