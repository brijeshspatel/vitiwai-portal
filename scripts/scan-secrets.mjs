#!/usr/bin/env node
/**
 * Scans the whole git history for credentials, and exits non-zero on a hit.
 *
 * D10's acceptance says "a secret scan over the history is clean". Until this
 * existed that had been satisfied once, by hand, during the public-release
 * review - which makes it a memory rather than a check. A criterion that cannot
 * be re-run cannot be re-checked, and the answer decays silently.
 *
 *   npm run scan:secrets
 *
 * It reads every blob ever committed, not just the working tree, because a
 * secret removed in a later commit is still published by the history.
 */

import { execFileSync } from 'node:child_process';

/**
 * What counts as a credential.
 *
 * Each pattern is deliberately shaped rather than generic: a rule matching
 * "password" anywhere flags every comment about passwords, and a check that
 * cries wolf is one people learn to ignore.
 */
const RULES = [
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'GitHub fine-grained token', re: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/ },
  { name: 'Slack token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Stripe secret key', re: /\bsk_live_[0-9a-zA-Z]{24,}\b/ },
  { name: 'private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'JSON web token', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { name: 'connection string with a password', re: /\b[a-z+]+:\/\/[^\s:@/]+:[^\s:@/]{6,}@[^\s/]+/ },
];

/**
 * Known-good matches, by the blob that holds them.
 *
 * `.env.example` carries local container credentials on purpose - `postgres://
 * portal:portal@localhost` is a connection string with a password, and it is
 * meant to be. Allowing it by path rather than by weakening the rule keeps the
 * rule able to catch the same shape anywhere else.
 */
const ALLOWED = [
  { path: '.env.example', rule: 'connection string with a password' },
  { path: 'scripts/scan-secrets.mjs', rule: null }, // this file holds the patterns
  { path: 'compose.yaml', rule: 'connection string with a password' },
  // The same local container credential, as a test fixture. Verified by reading
  // it: postgres://portal:portal@localhost:15432/portal, which is the throwaway
  // pair .env.example publishes on purpose.
  { path: 'tests/unit/env.test.ts', rule: 'connection string with a password' },
];

function run(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
}

const allowed = (path, rule) =>
  ALLOWED.some((a) => a.path === path && (a.rule === null || a.rule === rule));

// Every blob ever committed, with the path it was committed at.
const objects = run(['rev-list', '--objects', '--all'])
  .split('\n')
  .map((line) => {
    const space = line.indexOf(' ');
    return space === -1 ? null : { sha: line.slice(0, space), path: line.slice(space + 1) };
  })
  .filter((o) => o && o.path && !o.path.startsWith('node_modules/'));

const findings = [];
let scanned = 0;

for (const { sha, path } of objects) {
  let content;
  try {
    content = run(['cat-file', '-p', sha]);
  } catch {
    continue; // not a blob, or binary git refuses to print
  }
  if (content.includes('\u0000')) continue; // binary
  scanned += 1;

  for (const rule of RULES) {
    const match = rule.re.exec(content);
    if (!match) continue;
    if (allowed(path, rule.name)) continue;
    findings.push({ rule: rule.name, path, sha: sha.slice(0, 8), sample: match[0].slice(0, 12) });
  }
}

console.log(`scanned ${scanned} text blob(s) across the full history for ${RULES.length} pattern(s)`);

if (findings.length > 0) {
  console.error(`\nFAIL - ${findings.length} possible credential(s):`);
  for (const f of findings) {
    console.error(`  ${f.rule} in ${f.path} (blob ${f.sha}), starting "${f.sample}..."`);
  }
  console.error('\nA secret in history stays published even after the file is deleted.');
  process.exit(1);
}

console.log('PASS - no credential found in any blob, at any point in the history.');
