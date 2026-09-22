import { appendFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Where a measurement goes so that it survives the run.
 *
 * `console.log` inside a test is swallowed by this Vitest version when the test
 * passes, which is exactly backwards for this project: a budget that passes at
 * 41 KiB and one that passes at 199 KiB are the same green tick and very
 * different facts. A suite that measures things has to leave the measurements
 * somewhere a person can read afterwards.
 *
 * The file is line-delimited JSON, appended to, and ignored by git. It is
 * evidence for a run, not a tracked artefact - committing it would date
 * immediately and be wrong the first time anyone else ran the suite.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(root, 'measurements.jsonl');

export function startRecording(): void {
  try {
    rmSync(OUT);
  } catch {
    // Absent is the normal case on a clean checkout.
  }
  mkdirSync(dirname(OUT), { recursive: true });
}

export function record(kind: string, subject: string, values: Record<string, number | string>): void {
  const line = JSON.stringify({ at: new Date().toISOString(), kind, subject, ...values });
  appendFileSync(OUT, `${line}\n`, 'utf8');
  // Written to stdout directly, because console.log does not survive here.
  process.stdout.write(`[measured] ${kind} ${subject} ${JSON.stringify(values)}\n`);
}

export const MEASUREMENTS_PATH = OUT;
