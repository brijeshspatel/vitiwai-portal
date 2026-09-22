#!/usr/bin/env node
/**
 * Frees the portal's port, then reports what is on it.
 *
 * `pkill -f "next start"` does not reliably reach the Node process behind a
 * Next.js server on Windows, so a stale instance keeps serving the previous
 * build and every verification reads the old pages. That cost two debugging
 * detours in increment 1C before it was worth automating.
 *
 * DEVELOPMENT ONLY.
 */

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './lib/env-file.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
loadEnvFile(root);
const port = Number(process.env.PORT_PORTAL ?? 3000);

function bindable() {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen({ port, host: '0.0.0.0', exclusive: true }, () => server.close(() => resolve(true)));
  });
}

if (await bindable()) {
  console.log(`PASS - port ${port} is already free.`);
  process.exit(0);
}

if (process.platform !== 'win32') {
  console.error(`FAIL - port ${port} is busy. Stop the process holding it and try again.`);
  process.exit(1);
}

console.log(`INFO - port ${port} is busy; stopping whatever holds it`);
try {
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile', '-Command',
      `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue |` +
        ' ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }',
    ],
    { stdio: 'ignore' },
  );
} catch {
  /* reported by the check below */
}

await new Promise((r) => setTimeout(r, 1500));

if (await bindable()) {
  console.log(`PASS - port ${port} is free.`);
} else {
  console.error(`FAIL - port ${port} is still busy.`);
  process.exit(1);
}
