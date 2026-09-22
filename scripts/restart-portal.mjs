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
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './lib/env-file.mjs';
import { isFree } from './lib/port.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
loadEnvFile(root);
const port = Number(process.env.PORT_PORTAL ?? 3000);

// `isFree` asks both address families and also connects. This script used to
// bind `0.0.0.0` alone, and `next start` binds the IPv6 wildcard `::`, so on
// 2026-09-22 it reported "port 3000 is already free" while curl got 200 from
// the server it had just failed to stop - the precise failure it exists to
// prevent. scripts/lib/port.mjs carries the measurement.
const bindable = () => isFree(port);

if (await bindable()) {
  console.log(`PASS - port ${port} is already free.`);
  process.exit(0);
}

if (process.platform !== 'win32') {
  console.error(`FAIL - port ${port} is busy. Stop the process holding it and try again.`);
  process.exit(1);
}

console.log(`INFO - port ${port} is busy; stopping whatever holds it`);

// Windows PowerShell 5.1 is not everywhere. On the development machine
// `powershell.exe` is ENOENT and only `pwsh.exe` resolves, so the single
// hard-coded name meant the kill never ran at all - and the `catch` below
// swallowed the ENOENT while the old bind probe reported the port free
// anyway. Try each, and say which one answered.
const SHELLS = ['pwsh.exe', 'powershell.exe'];

// Listed connections are read first and killed by pid, so the script can name
// what it stopped. A pipeline that kills without reporting leaves the operator
// guessing when the port is still busy afterwards.
const SCRIPT =
  `$c = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue; ` +
  'if (-not $c) { Write-Output "none" ; exit 0 } ; ' +
  '$c.OwningProcess | Sort-Object -Unique | ForEach-Object { ' +
  '$p = Get-Process -Id $_ -ErrorAction SilentlyContinue ; ' +
  'Write-Output ("killing {0} {1}" -f $_, $(if ($p) { $p.ProcessName } else { "<gone>" })) ; ' +
  'Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }';

let ran = false;
for (const shell of SHELLS) {
  try {
    const out = execFileSync(shell, ['-NoProfile', '-Command', SCRIPT], { encoding: 'utf8' });
    for (const line of out.split('\n').map((l) => l.trim()).filter(Boolean)) {
      console.log(`INFO - ${line}`);
    }
    ran = true;
    break;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`WARN - ${shell} failed: ${error.message.split('\n')[0]}`);
      ran = true;
      break;
    }
  }
}

if (!ran) {
  console.error(`FAIL - no PowerShell found. Tried: ${SHELLS.join(', ')}.`);
  console.error(`       Find the process yourself and stop it, then run this again.`);
  process.exit(1);
}

await new Promise((r) => setTimeout(r, 1500));

if (await bindable()) {
  console.log(`PASS - port ${port} is free.`);
} else {
  console.error(`FAIL - port ${port} is still busy.`);
  process.exit(1);
}
