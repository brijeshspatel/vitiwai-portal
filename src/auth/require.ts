import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { loadEnv } from '@/config/env';
import { getPool } from '@/db/client';
import { readSession, SESSION_COOKIE, type SessionUser } from './session';

/**
 * The guard. Every /account route calls this before reading anything.
 *
 * Middleware also redirects an unauthenticated visitor, but middleware is not
 * the control: a route added later that forgets to call this must fail closed,
 * and middleware alone would let it through. This is the check that actually
 * decides.
 */
export async function requireSession(): Promise<SessionUser> {
  const user = await currentSession();
  if (user === null) redirect('/signin');
  return user;
}

/** The same read, without the redirect, for a page that renders either way. */
export async function currentSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value ?? '';
  if (!id) return null;
  return readSession(getPool(loadEnv()), id);
}
