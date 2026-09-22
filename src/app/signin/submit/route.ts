import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { loadEnv } from '@/config/env';
import { getPool } from '@/db/client';
import { findPortalUserByEmail } from '@/db/users';
import { verifyPassword } from '@/domain/password';
import { createSession, SESSION_COOKIE, SESSION_HOURS } from '@/auth/session';
import { SIGNIN_FAILED } from '@/auth/messages';
import { rejectIfForged } from '@/security/require-csrf';
import { firstProblem, signInSchema } from '@/security/schemas';
import { clientAddress, consume, SIGNIN_BY_ADDRESS, SIGNIN_BY_EMAIL } from '@/security/ratelimit';

/**
 * A plain form post, so signing in works without JavaScript.
 *
 * It lives at /signin/submit rather than /signin because a page and a route
 * handler cannot share a path in the App Router.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData();
  // Reject a forged request before anything is read from it.
  const forged = await rejectIfForged(form);
  if (forged) return forged;

  const candidate = signInSchema.safeParse({
    email: form.get('email'),
    password: form.get('password'),
    next: form.get('next') ?? undefined,
  });
  if (!candidate.success) {
    // A malformed sign-in gets the same message as a wrong one. Telling the
    // sender which field was malformed would distinguish a real address from
    // a missing one, which is the enumeration oracle SIGNIN_FAILED avoids.
    return NextResponse.redirect(
      new URL(`/signin?error=${encodeURIComponent(SIGNIN_FAILED)}`, request.nextUrl.origin),
      303,
    );
  }
  const { email, password } = candidate.data;

  // Two budgets: per email slows guessing at one account, per address slows
  // spraying across many. Both are counted before the password is checked, so
  // the cost of an attempt does not depend on whether the account exists.
  const pool = getPool(loadEnv());
  const byEmail = await consume(pool, SIGNIN_BY_EMAIL, email.toLowerCase());
  const byAddress = await consume(pool, SIGNIN_BY_ADDRESS, clientAddress(request));
  if (!byEmail.allowed || !byAddress.allowed) {
    const resetsAt = byEmail.allowed ? byAddress.resetsAt : byEmail.resetsAt;
    return new NextResponse('Too many attempts. Try again shortly.', {
      status: 429,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'retry-after': String(Math.max(1, Math.ceil((resetsAt.getTime() - Date.now()) / 1000))),
      },
    });
  }
  const next = candidate.data.next ?? '/account';

  const origin = request.nextUrl.origin;
  const fail = () =>
    NextResponse.redirect(
      new URL(`/signin?error=${encodeURIComponent(SIGNIN_FAILED)}`, origin),
      303,
    );

  if (!email || !password) return fail();

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
