import type pg from 'pg';

/**
 * A fixed-window counter, in the portal's own database.
 *
 * Fixed window rather than a sliding one because it is one statement and one
 * row, and the failure mode is understood: a caller can spend a full budget at
 * the end of one window and another at the start of the next. For sign-in that
 * is acceptable - it halves the effective delay in the worst case and still
 * turns an unlimited guessing rate into a bounded one.
 *
 * The counter lives in PostgreSQL, not in memory. An in-memory map is lost on
 * restart, is wrong the moment a second instance exists, and cannot be tested
 * across a process boundary - the test would read the same map the code just
 * wrote.
 */

export interface Budget {
  /** Which limit this is, so two limits cannot collide on one key. */
  readonly bucket: string;
  /** How many attempts are allowed in a window. */
  readonly limit: number;
  /** How long a window lasts. */
  readonly windowSeconds: number;
}

export interface Verdict {
  readonly allowed: boolean;
  readonly remaining: number;
  /** When the current window ends, for a Retry-After header. */
  readonly resetsAt: Date;
}

/** Sign-in, per email address. Slows guessing at one account. */
export const SIGNIN_BY_EMAIL: Budget = { bucket: 'signin-email', limit: 5, windowSeconds: 300 };

/** Sign-in, per client address. Slows spraying across many accounts. */
export const SIGNIN_BY_ADDRESS: Budget = { bucket: 'signin-address', limit: 20, windowSeconds: 300 };

/** Uploads, per client address. Each one costs an OCR read. */
export const UPLOAD_BY_ADDRESS: Budget = { bucket: 'upload-address', limit: 10, windowSeconds: 600 };

/**
 * Counts this attempt and says whether it is inside the budget.
 *
 * The insert and the increment are one statement, so two concurrent requests
 * cannot both read a count of four and both decide they are the fifth.
 */
export async function consume(pool: pg.Pool, budget: Budget, key: string): Promise<Verdict> {
  const windowMs = budget.windowSeconds * 1000;
  const start = new Date(Math.floor(Date.now() / windowMs) * windowMs);

  const { rows } = await pool.query<{ count: number }>(
    `INSERT INTO rate_limit (bucket, key, window_start, count)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (bucket, key, window_start)
     DO UPDATE SET count = rate_limit.count + 1
     RETURNING count`,
    [budget.bucket, key, start],
  );

  const count = rows[0]?.count ?? 1;
  return {
    allowed: count <= budget.limit,
    remaining: Math.max(0, budget.limit - count),
    resetsAt: new Date(start.getTime() + windowMs),
  };
}

/**
 * The client's address, as far as it can be known.
 *
 * Behind a proxy this is a header the client cannot be stopped from sending, so
 * it is a rate-limiting key and never an authorisation input. `unknown` is a
 * key like any other: everyone without a usable address shares one budget,
 * which is the safe direction.
 */
export function clientAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Clears windows that have ended. Nothing reads them again. */
export async function forgetOldWindows(pool: pg.Pool, olderThanSeconds = 86_400): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM rate_limit WHERE window_start < now() - make_interval(secs => $1)`,
    [olderThanSeconds],
  );
  return rowCount ?? 0;
}
