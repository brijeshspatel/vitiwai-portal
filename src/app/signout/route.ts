import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { loadEnv } from '@/config/env';
import { getPool } from '@/db/client';
import { deleteSession, SESSION_COOKIE } from '@/auth/session';
import { rejectIfForged } from '@/security/require-csrf';
import { recordEvent } from '@/audit/record';
import { requestOrigin } from '@/http/origin';

/**
 * Signing out deletes the row, not just the cookie.
 *
 * Clearing the cookie alone would leave a usable session behind for anyone who
 * had captured the identifier. That is the whole reason sessions are
 * server-side.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
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
  // Built from the address the visitor used, like every other redirect here.
  // It was `PORTAL_BASE_URL ?? 'http://localhost:3000'`, which on any deployed
  // build sends the visitor to their own machine unless someone remembers to
  // set a variable nothing checks.
  return NextResponse.redirect(new URL('/', requestOrigin(request)), 303);
}
