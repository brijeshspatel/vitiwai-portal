import type pg from 'pg';

/**
 * The audit trail: one row per state change, written by the code that made it.
 *
 * Not a database trigger. A trigger sees the row change but not the actor, the
 * request or the intent, which is most of what an audit entry is for - "the
 * balance changed" is in the ledger already; "this customer paid this invoice"
 * is what a reader needs.
 *
 * **Where the state change is in the portal's own database**, the caller may
 * pass a client so the row lands in the same transaction as the change. **Where
 * it is in Odoo** it cannot: that is a remote call, so the row is written after
 * it returns. A crash between the two loses the row, not the money - the same
 * ordering increment 1C chose for payments, and for the same reason. The gap is
 * stated rather than designed around.
 */

export type AuditAction =
  | 'signin.succeeded'
  | 'signin.failed'
  | 'signout'
  | 'application.submitted'
  | 'payment.recorded'
  | 'planchange.requested'
  | 'case.opened';

export interface AuditEvent {
  readonly action: AuditAction;
  /** The portal user, where one is known. Null for a failed sign-in. */
  readonly actorUser?: string | number | null;
  readonly subjectType: string;
  readonly subjectId?: string | null;
  /**
   * Context, and nothing sensitive.
   *
   * Never a password, a token, a session identifier or a document image. The
   * trail records that a thing happened; it is not a second copy of the thing.
   * `redact` drops anything whose key suggests otherwise, so a careless caller
   * cannot widen the blast radius of this table.
   */
  readonly detail?: Record<string, unknown>;
}

const FORBIDDEN = /pass|token|secret|session|cookie|image|bytes|document|csrf/i;

/** Drops any key that looks like it carries something this table must not hold. */
export function redact(detail: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (FORBIDDEN.test(key)) continue;
    safe[key] = value;
  }
  return safe;
}

type Queryable = Pick<pg.Pool, 'query'>;

/**
 * Writes one row.
 *
 * It never throws. An audit write that fails must not take a completed payment
 * down with it - the customer's money has already moved, and refusing them a
 * receipt because a log line failed is the worse outcome. A failure is reported
 * on stderr, where the runbook says to look.
 */
export async function recordEvent(db: Queryable, event: AuditEvent): Promise<void> {
  try {
    await db.query(
      `INSERT INTO audit_event (action, actor_user, subject_type, subject_id, detail)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        event.action,
        event.actorUser ?? null,
        event.subjectType,
        event.subjectId ?? null,
        JSON.stringify(redact(event.detail ?? {})),
      ],
    );
  } catch (cause) {
    console.error(`[audit] could not record ${event.action}:`, cause);
  }
}
