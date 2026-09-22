import { randomBytes } from 'node:crypto';
import type pg from 'pg';

/**
 * Server-side sessions.
 *
 * The cookie holds an opaque identifier and nothing else. It encodes no user,
 * so it cannot be decoded or tampered into somebody else's session, and it can
 * be revoked - signing out deletes the row and the session is dead everywhere
 * it was ever used. A signed token would have made sign-out a client-side lie
 * until expiry.
 *
 * Expiry is absolute at 12 hours with no sliding renewal. That figure is an
 * assumption recorded as open item U10; it is not a considered security posture
 * and it is cheap to change.
 */

export const SESSION_COOKIE = 'vitiwai_session';
export const SESSION_HOURS = 12;

/** 256 bits, base64url. Long enough that guessing is not a threat model. */
export function newSessionId(): string {
  return randomBytes(32).toString('base64url');
}

export function expiryFrom(now: Date, hours = SESSION_HOURS): Date {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

/** Pure, so the rule can be tested without a database. */
export function isExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export interface SessionUser {
  readonly userId: string;
  readonly email: string;
  readonly odooPartnerId: string;
}

export async function createSession(pool: pg.Pool, userId: string): Promise<string> {
  const id = newSessionId();
  await pool.query('INSERT INTO portal_session (id, user_id, expires_at) VALUES ($1, $2, $3)', [
    id,
    userId,
    expiryFrom(new Date()),
  ]);
  return id;
}

/**
 * Returns the session's user, or null.
 *
 * Expiry is filtered in SQL rather than in JavaScript so an expired row can
 * never be read and then forgotten about.
 */
export async function readSession(pool: pg.Pool, id: string): Promise<SessionUser | null> {
  if (!id) return null;
  const result = await pool.query(
    `SELECT u.id, u.email, u.odoo_partner_id
       FROM portal_session s
       JOIN portal_user u ON u.id = s.user_id
      WHERE s.id = $1 AND s.expires_at > now()`,
    [id],
  );
  const row = result.rows[0] as
    | { id: string; email: string; odoo_partner_id: string }
    | undefined;
  if (!row) return null;
  return { userId: String(row.id), email: row.email, odooPartnerId: row.odoo_partner_id };
}

export async function deleteSession(pool: pg.Pool, id: string): Promise<void> {
  await pool.query('DELETE FROM portal_session WHERE id = $1', [id]);
}

/** Housekeeping. Nothing depends on it, because expiry is enforced on read. */
export async function deleteExpiredSessions(pool: pg.Pool): Promise<number> {
  const result = await pool.query('DELETE FROM portal_session WHERE expires_at <= now()');
  return result.rowCount ?? 0;
}
