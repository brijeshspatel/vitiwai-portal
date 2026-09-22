import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { loadEnv } from '@/config/env';
import { getPool } from '@/db/client';
import { deleteSession, SESSION_COOKIE } from '@/auth/session';
import { rejectIfForged } from '@/security/require-csrf';
import { recordEvent } from '@/audit/record';

/**
 * Signing out deletes the row, not just the cookie.
 *
 * Clearing the cookie alone would leave a usable session behind for anyone who
 * had captured the identifier. That is the whole reason sessions are
 * server-side.
 */
export async function POST(request: Request): Promise<NextResponse> {
  // Sign-out changes server state, so it carries a token like any other
  // mutation. Without one, a page on another site could sign a customer out -
  // harmless in isolation, and a way to make them re-authenticate somewhere an
  // attacker controls the timing of.
  const forged = await rejectIfForged(await request.formData());
  if (forged) return forged;

  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  const pool = getPool(loadEnv());
  if (id) {
    await deleteSession(pool, id);
    await recordEvent(pool, { action: 'signout', subjectType: 'session' });
  }
  jar.delete(SESSION_COOKIE);
  return NextResponse.redirect(new URL('/', process.env.PORTAL_BASE_URL ?? 'http://localhost:3000'));
}
