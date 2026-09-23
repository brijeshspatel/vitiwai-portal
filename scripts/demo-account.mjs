#!/usr/bin/env node
/**
 * Gives a public demonstration one account a visitor can sign in to.
 *
 * Without this the demonstration is half a portal: plans and account opening
 * work, and everything behind sign-in - the bill, the usage, paying, raising a
 * support request, changing a plan - is unreachable. A reviewer following a
 * link has no way in.
 *
 * The credential is deliberately published on the sign-in page. It guards
 * nothing: every customer, invoice and reading behind it is generated, and the
 * account is the same for everyone who visits. A secret that protects synthetic
 * data would only stop people seeing the thing they were sent to look at.
 *
 * Idempotent, so the container can run it on every start.
 *
 * DEMONSTRATION ONLY. It does nothing unless DEMO_MODE is `true`.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './lib/env-file.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
loadEnvFile(root);

if (process.env.DEMO_MODE !== 'true') {
  console.log('INFO - not a demonstration build; no demonstration account created.');
  process.exit(0);
}

// Imported by relative path rather than the `@/` alias: that alias is resolved
// by Next.js and Vitest, and plain Node does not know it.
const { hashPassword } = await import('../src/domain/password.ts');
const pg = (await import('pg')).default;

/** Matches the first customer `DemoCustomerAdapter` generates. */
const PARTNER_ID = 'demo-0';
const EMAIL = process.env.DEMO_ACCOUNT_EMAIL ?? 'demo@vitiwai.example';
const PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD ?? 'demo-passphrase';

const url = process.env.PORTAL_DATABASE_URL;
if (!url) {
  console.error('FAIL - PORTAL_DATABASE_URL is not set.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
try {
  const existing = await pool.query('SELECT id FROM portal_user WHERE email = $1', [EMAIL]);
  if (existing.rows.length > 0) {
    console.log(`PASS - the demonstration account ${EMAIL} is already present.`);
  } else {
    await pool.query(
      `INSERT INTO portal_user (email, password_hash, odoo_partner_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING`,
      [EMAIL, await hashPassword(PASSWORD), PARTNER_ID],
    );
    console.log(`PASS - demonstration account created: ${EMAIL} / ${PASSWORD}`);
  }
} catch (error) {
  // A failure here leaves a demonstration nobody can sign in to, which is worth
  // failing the start for rather than discovering from a visitor.
  console.error(`FAIL - could not create the demonstration account: ${error.message}`);
  process.exit(1);
} finally {
  await pool.end();
}
