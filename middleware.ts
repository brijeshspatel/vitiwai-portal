import { NextResponse, type NextRequest } from 'next/server';

/**
 * Redirect comfort, not the control.
 *
 * This sends a signed-out visitor to /signin instead of showing them a broken
 * page. It checks only that a cookie is present - it cannot read the database -
 * so it can be fooled by any string. `requireSession()` is what actually
 * decides, and every /account route calls it.
 */
export function middleware(request: NextRequest): NextResponse {
  const hasCookie = request.cookies.has('vitiwai_session');
  if (!hasCookie) {
    const url = request.nextUrl.clone();
    url.pathname = '/signin';
    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/account/:path*'] };
