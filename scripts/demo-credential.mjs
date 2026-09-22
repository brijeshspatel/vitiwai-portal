#!/usr/bin/env node
/**
 * Gives a seeded customer a portal credential, so the account pages can be
 * demonstrated without completing onboarding first.
 *
 * The seed creates customers in Odoo; portal credentials are created by
 * onboarding in increment 1B. A seeded customer therefore has no way to sign
 * in, which is correct but inconvenient for a demonstration.
 *
 * DEMONSTRATION ONLY. It sets a known password on synthetic data.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './lib/env-file.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
loadEnvFile(root);

// Imported by relative path, not the `@/` alias: that alias is resolved by
// Next.js and Vitest, and plain Node does not know it. `password.ts` imports
// only node:crypto, so it resolves cleanly; `db/users.ts` does not, which is
// why this script uses SQL directly rather than going through it.
const { hashPassword } = await import('../src/domain/password.ts');
const pg = (await import('pg')).default;

const EMAIL = process.env.DEMO_EMAIL ?? 'adi.baleiwai.19@example.test';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'demo-passphrase';

const odooUrl = process.env.ODOO_URL;
const odooDb = process.env.ODOO_DB;
const odooUser = process.env.ODOO_USER;
const odooPassword = process.env.ODOO_PASSWORD;

async function rpc(service, method, args) {
  const response = await fetch(`${odooUrl}/jsonrpc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: 1 }),
  });
  const body = await response.json();
  if (body.error) throw new Error(body.error.data?.message ?? 'Odoo rejected the call');
  return body.result;
}

const pool = new pg.Pool({ connectionString: process.env.PORTAL_DATABASE_URL, max: 2 });

try {
  const existing = await pool.query(
    'SELECT odoo_partner_id FROM portal_user WHERE email = $1',
    [EMAIL.toLowerCase()],
  );
  if (existing.rowCount > 0) {
    console.log(`PASS - ${EMAIL} already has a credential (partner ${existing.rows[0].odoo_partner_id}).`);
  } else {
    const uid = await rpc('common', 'login', [odooDb, odooUser, odooPassword]);
    const rows = await rpc('object', 'execute_kw', [
      odooDb, uid, odooPassword, 'res.partner', 'search_read',
      [[['email', '=', EMAIL]]], { fields: ['id', 'name'], limit: 1 },
    ]);
    if (rows.length === 0) {
      console.error(`FAIL - no seeded customer with email ${EMAIL}. Run \`npm run seed\` first.`);
      process.exit(1);
    }
    await pool.query(
      'INSERT INTO portal_user (email, password_hash, odoo_partner_id) VALUES ($1, $2, $3)',
      [EMAIL.toLowerCase(), await hashPassword(PASSWORD), String(rows[0].id)],
    );
    console.log(`PASS - credential created for ${rows[0].name} <${EMAIL}>, partner ${rows[0].id}.`);
  }
  console.log(`INFO - sign in with ${EMAIL} / ${PASSWORD}`);
} finally {
  await pool.end();
}
