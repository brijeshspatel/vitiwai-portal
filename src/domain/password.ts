import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Password hashing with scrypt from the standard library.
 *
 * No dependency: `node:crypto` provides scrypt, which is memory-hard and
 * appropriate here. The stored form is `scrypt$N$r$p$salt$hash`, all hex, so a
 * future parameter change can be told apart from an old hash.
 *
 * A plaintext password never reaches a log, a database column or Odoo.
 */

/**
 * `promisify` drops scrypt's options overload, so the cost parameters cannot be
 * passed through it. Wrapping the callback form by hand keeps them.
 */
function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

const N = 16384;
const r = 8;
const p = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

export async function hashPassword(password: string): Promise<string> {
  if (password.length === 0) {
    throw new Error('a password must not be empty');
  }
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(password, salt, KEY_LENGTH, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, nRaw, rRaw, pRaw, saltHex, keyHex] = parts as [string, string, string, string, string, string];
  const cost = Number(nRaw);
  const block = Number(rRaw);
  const parallel = Number(pRaw);
  if (!Number.isInteger(cost) || !Number.isInteger(block) || !Number.isInteger(parallel)) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(keyHex, 'hex');
    if (expected.length === 0) return false;
  } catch {
    return false;
  }

  try {
    const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length, {
      N: cost,
      r: block,
      p: parallel,
    });
    // Constant time, so a wrong password cannot be narrowed down by timing.
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
