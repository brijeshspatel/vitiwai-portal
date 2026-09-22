import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { loadEnv } from '@/config/env';
import { getPool } from '@/db/client';
import { findPortalUserByEmail } from '@/db/users';
import { verifyPassword } from '@/domain/password';
import { createSession, SESSION_COOKIE, SESSION_HOURS } from '@/auth/session';
import { SIGNIN_FAILED } from '@/auth/messages';

/**
 * A plain form post, so signing in works without JavaScript.
 *
 * It lives at /signin/submit rather than /signin because a page and a route
 * handler cannot share a path in the App Router.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const next = String(form.get('next') ?? '/account');

  const origin = request.nextUrl.origin;
  const fail = () =>
    NextResponse.redirect(
      new URL(`/signin?error=${encodeURIComponent(SIGNIN_FAILED)}`, origin),
      303,
    );

  if (!email || !password) return fail();

  const pool = getPool(loadEnv());
  const user = await findPortalUserByEmail(pool, email);

  // The hash is verified even when no user was found, so both paths take
  // comparable time. A fast "no such user" is its own enumeration oracle.
  const stored = user?.passwordHash ?? 'scrypt$16384$8$1$0000$0000';
  const matches = await verifyPassword(password, stored);

  if (!user || !matches) return fail();

  const id = await createSession(pool, user.id);

  // Only a path on this site, so `next` cannot be turned into an open redirect.
  const destination = next.startsWith('/') && !next.startsWith('//') ? next : '/account';
  const response = NextResponse.redirect(new URL(destination, origin), 303);
  response.cookies.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_HOURS * 60 * 60,
  });
  return response;
}
