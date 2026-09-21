import pg from 'pg';
import type { Env } from '@/config/env';

/**
 * The portal's own database.
 *
 * One pool per process. Every query in this directory is parameterised, and
 * there is no template literal in any of them - keeping SQL injection out of a
 * directory is more reliable than keeping it out of one function.
 */

let pool: pg.Pool | undefined;

export function getPool(env: Env): pg.Pool {
  pool ??= new pg.Pool({ connectionString: env.PORTAL_DATABASE_URL, max: 5 });
  return pool;
}

/** For tests, which open and close a pool of their own. */
export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 2 });
}
