/**
 * Reads `.env` into a plain object, and optionally into `process.env`.
 *
 * One reader, used by the port preflight, the Odoo initialiser, the seed and
 * the contract test setup. Those first three each carried a private copy of
 * this parser until 2026-09-22; four copies of one parser is three chances for
 * them to disagree about quoting or precedence.
 *
 * No dependency. The parser is small enough that `dotenv` would be a larger
 * commitment than the code it replaces.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The files read, in order, each overriding the one before it.
 *
 * Both are read and merged rather than taking the first that exists. That
 * matters for a partial `.env`: a key it omits still resolves from
 * `.env.example` instead of becoming undefined. Two of the three scripts that
 * previously carried their own parser already merged this way; the third took
 * the first file whole, and merging is a strict superset of that for a
 * complete `.env`.
 */
const CANDIDATES = ['.env.example', '.env'];

/**
 * @param {string} root repository root
 * @returns {{ sources: string[], values: Record<string, string> }}
 *   `sources` names every file actually read, in the order applied.
 */
export function readEnvFile(root) {
  /** @type {Record<string, string>} */
  const values = {};
  /** @type {string[]} */
  const sources = [];

  for (const name of CANDIDATES) {
    let text;
    try {
      text = readFileSync(join(root, name), 'utf8');
    } catch {
      continue;
    }
    sources.push(name);
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#')) continue;

      const equals = trimmed.indexOf('=');
      if (equals <= 0) continue;

      const key = trimmed.slice(0, equals).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

      // Everything after the FIRST equals sign. A connection string such as
      // postgres://u:p@host/db?opt=1 carries more of them, and splitting on
      // every one truncates it silently.
      let value = trimmed.slice(equals + 1).trim();

      // One layer of surrounding quotes, and only a matching pair.
      if (value.length >= 2) {
        const first = value[0];
        const last = value[value.length - 1];
        if ((first === "'" && last === "'") || (first === '"' && last === '"')) {
          value = value.slice(1, -1);
        }
      }

      values[key] = value;
    }
  }

  return { sources, values };
}

/**
 * Assigns the file's values into `process.env`, without overwriting anything
 * already set.
 *
 * The real environment wins. That is the conventional precedence, and it lets
 * a continuous-integration job or a developer override one value without
 * editing a committed file.
 *
 * @param {string} root repository root
 * @returns {{ sources: string[], applied: string[] }} the keys actually set
 */
export function loadEnvFile(root) {
  const { sources, values } = readEnvFile(root);
  const applied = [];
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
      applied.push(key);
    }
  }
  return { sources, applied };
}
