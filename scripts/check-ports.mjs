#!/usr/bin/env node
/**
 * Port preflight.
 *
 * Two checks per port, because on Windows neither one alone is sufficient:
 *
 *  1. Is something listening?  Catches a port another process already serves.
 *  2. Can we actually bind it? Catches a port the operating system reserves.
 *     A reserved port has NO listener, so check 1 reports it free and
 *     `docker compose up` then fails with "An attempt was made to access a
 *     socket in a way forbidden by its access permissions".
 *
 * That second case cost a debugging session on 2026-09-21: ports 55432 and
 * 55433 sit inside the Windows reserved range 55403-55502.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEnvFile } from './lib/env-file.mjs';
import { isBindable, isOccupied } from './lib/port.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The reader lives in scripts/lib/env-file.mjs so the preflight, the Odoo
// initialiser, the seed and the contract test setup all parse .env the same way.
// It now merges .env.example and .env per key, where this script previously took
// the first file whole - a partial .env resolves the rest instead of failing.

// Both checks now live in scripts/lib/port.mjs, so `npm run portal:free` asks
// the same questions this preflight does. Each asks both address families: a
// server on the IPv6 wildcard leaves `0.0.0.0` bindable, and a server on IPv4
// loopback alone is invisible from `[::1]`.

const PORT_KEYS = [
  'PORT_PORTAL',
  'PORT_ODOO',
  'PORT_PORTAL_DB',
  'PORT_ODOO_DB',
  'PORT_MEILI',
  'PORT_GATEWAY',
  'PORT_OCR',
  'PORT_DOCGEN',
  'PORT_MAILPIT_SMTP',
  'PORT_MAILPIT_WEB',
];

const { sources, values: fileValues } = readEnvFile(root);
const sourceName = sources.length > 0 ? sources.join(' then ') : '(no .env file)';
const problems = [];
const rows = [];

for (const key of PORT_KEYS) {
  const raw = process.env[key] ?? fileValues[key];
  if (raw === undefined) {
    problems.push(`${key} is not set in the environment or in ${sourceName}`);
    continue;
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    problems.push(`${key}=${raw} is not a valid port number`);
    continue;
  }

  const occupied = await isOccupied(port);
  const bindable = occupied ? false : await isBindable(port);

  let verdict;
  if (occupied) {
    verdict = 'OCCUPIED';
    problems.push(`${key}=${port} is already in use by another process`);
  } else if (!bindable) {
    verdict = 'REFUSED';
    problems.push(
      `${key}=${port} cannot be bound. It is reserved by the operating system. ` +
        `On Windows, run: netsh interface ipv4 show excludedportrange protocol=tcp`,
    );
  } else {
    verdict = 'usable';
  }
  rows.push({ key, port, verdict });
}

const width = Math.max(...rows.map((r) => r.key.length), 10);
for (const row of rows) {
  console.log(`${row.key.padEnd(width)}  ${String(row.port).padStart(5)}  ${row.verdict}`);
}

if (problems.length > 0) {
  console.error(`\nFAIL - ${problems.length} port problem(s), read from ${sourceName}:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('\nChange the port in .env and run `npm run preflight` again.');
  process.exit(1);
}

console.log(`\nPASS - ${rows.length} port(s) usable, read from ${sourceName}.`);
