#!/usr/bin/env node
/**
 * Creates the Odoo database if it is not there.
 *
 * Odoo's first run installs 64 modules and took 118 s when measured on
 * 2026-09-21. That is slow enough to look like a hang, so this prints progress
 * and polls readiness rather than sleeping for a fixed period - a fixed sleep
 * is either too short on a cold machine or wasted on a warm one.
 *
 * Idempotent: running it against an initialised database exits 0 and changes
 * nothing.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function env() {
  const values = {};
  for (const name of ['.env.example', '.env']) {
    try {
      for (const line of readFileSync(join(root, name), 'utf8').split(/\r?\n/)) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
        if (m) values[m[1]] = m[2];
      }
    } catch {
      /* optional */
    }
  }
  return { ...values, ...process.env };
}

const cfg = env();
const ODOO_URL = cfg.ODOO_URL ?? 'http://localhost:8069';
const ODOO_DB = cfg.ODOO_DB ?? 'vitiwai';
const MODULES = 'base,crm,account,project';

async function rpc(service, method, args) {
  const response = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: 1 }),
  });
  const body = await response.json();
  if (body.error) throw new Error(body.error.data?.message ?? JSON.stringify(body.error));
  return body.result;
}

async function databaseExists() {
  try {
    const list = await rpc('db', 'list', []);
    return Array.isArray(list) && list.includes(ODOO_DB);
  } catch {
    return false;
  }
}

async function waitForOdoo(seconds = 240) {
  process.stdout.write('waiting for Odoo to accept connections');
  for (let i = 0; i < seconds / 5; i += 1) {
    try {
      await rpc('common', 'version', []);
      process.stdout.write(' ready\n');
      return true;
    } catch {
      process.stdout.write('.');
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  process.stdout.write(' TIMED OUT\n');
  return false;
}

if (!(await waitForOdoo())) {
  console.error(`FAIL - Odoo did not answer at ${ODOO_URL}. Is \`docker compose up -d\` running?`);
  process.exit(1);
}

if (await databaseExists()) {
  console.log(`PASS - database "${ODOO_DB}" already exists. Nothing to do.`);
  process.exit(0);
}

console.log(`INFO - creating database "${ODOO_DB}" with modules: ${MODULES}`);
console.log('INFO - this installs 64 modules and took 118 s when measured. It is not stuck.');

try {
  execFileSync(
    'docker',
    [
      'compose', 'exec', '-T', 'odoo',
      'odoo', '-d', ODOO_DB, '-i', MODULES,
      '--without-demo=all', '--stop-after-init',
      '--db_host=odoo-db', '--db_user=odoo', '--db_password=odoo',
    ],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch (error) {
  console.error('FAIL - Odoo initialisation failed.');
  console.error(String(error.stderr ?? error.message).split('\n').slice(-12).join('\n'));
  process.exit(1);
}

console.log('INFO - restarting Odoo so it serves the new database');
execFileSync('docker', ['compose', 'restart', 'odoo'], { cwd: root, stdio: 'ignore' });

if (!(await waitForOdoo())) {
  console.error('FAIL - Odoo did not come back after the restart.');
  process.exit(1);
}

if (!(await databaseExists())) {
  console.error(`FAIL - database "${ODOO_DB}" is still not listed after initialisation.`);
  process.exit(1);
}

console.log(`PASS - database "${ODOO_DB}" created and serving.`);
