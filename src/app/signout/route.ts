import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { loadEnv } from '@/config/env';
import { getPool } from '@/db/client';
import { deleteSession, SESSION_COOKIE } from '@/auth/session';

/**
 * Signing out deletes the row, not just the cookie.
 *
 * Clearing the cookie alone would leave a usable session behind for anyone who
 * had captured the identifier. That is the whole reason sessions are
 * server-side.
 */
export async function POST(): Promise<NextResponse> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) await deleteSession(getPool(loadEnv()), id);
  jar.delete(SESSION_COOKIE);
  return NextResponse.redirect(new URL('/', process.env.PORTAL_BASE_URL ?? 'http://localhost:3000'));
}
