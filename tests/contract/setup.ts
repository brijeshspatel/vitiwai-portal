/**
 * Loads .env before any contract test module is imported.
 *
 * Without this the suite cannot run from a clean checkout: src/config/env.ts
 * reads process.env, and nothing else in the repository ever puts .env there.
 * During increment 1A it passed only because the shell had been primed by hand
 * with `set -a; . ./.env; set +a` - a step recorded nowhere, which is why the
 * first machine to run the suite unprimed, the CI runner, failed.
 *
 * It must be a setupFile rather than `test.env` in the config: `test.env` is
 * evaluated once when the config loads, whereas a setup file runs per test file,
 * which is when the values are actually read.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnvFile } from '../../scripts/lib/env-file.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { sources, applied } = loadEnvFile(repoRoot);

// Printed so a failing CI job says where its values came from, rather than
// leaving the reader to guess whether the file was found at all.
if (sources.length === 0) {
  console.warn('[contract setup] no .env or .env.example found at', repoRoot);
} else {
  console.log(
    `[contract setup] read ${sources.join(' then ')}; set ${applied.length} variable(s) not already in the environment`,
  );
}
