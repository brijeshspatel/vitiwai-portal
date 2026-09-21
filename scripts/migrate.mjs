#!/usr/bin/env node
/**
 * Applies the numbered SQL files in db/migrations, once each.
 *
 * Idempotent: a migration already recorded in `schema_migration` is skipped, so
 * running this twice changes nothing. Plain SQL and a table of what has run -
 * no migration engine, because there is nothing here an engine would earn.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadEnvFile } from './lib/env-file.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
loadEnvFile(root);

const url = process.env.PORTAL_DATABASE_URL;
if (!url) {
  console.error('FAIL - PORTAL_DATABASE_URL is not set');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
} catch (error) {
  console.error(`FAIL - cannot reach the portal database at ${url}`);
  console.error(`       ${error.message}`);
  console.error('       Is `docker compose up -d` running?');
  process.exit(1);
}

await client.query(`
  CREATE TABLE IF NOT EXISTS schema_migration (
    name       TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`);

const applied = new Set(
  (await client.query('SELECT name FROM schema_migration')).rows.map((r) => r.name),
);

const files = readdirSync(join(root, 'db', 'migrations')).filter((f) => f.endsWith('.sql')).sort();

let ran = 0;
for (const file of files) {
  if (applied.has(file)) {
    console.log(`  skip    ${file}`);
    continue;
  }
  const sql = readFileSync(join(root, 'db', 'migrations', file), 'utf8');
  // One transaction per migration: a failure leaves nothing half-applied.
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO schema_migration (name) VALUES ($1)', [file]);
    await client.query('COMMIT');
    console.log(`  applied ${file}`);
    ran += 1;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`FAIL - ${file} did not apply, and was rolled back`);
    console.error(`       ${error.message}`);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log(`PASS - ${ran} migration(s) applied, ${files.length - ran} already present.`);
