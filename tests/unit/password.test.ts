import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/domain/password';

describe('password hashing', () => {
  it('verifies a password against its own hash', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects a different password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('Correct Horse Battery Staple', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('salts per user, so the same password hashes differently each time', async () => {
    const a = await hashPassword('same password');
    const b = await hashPassword('same password');
    expect(a).not.toBe(b);
    expect(await verifyPassword('same password', a)).toBe(true);
    expect(await verifyPassword('same password', b)).toBe(true);
  });

  it('never stores the plaintext anywhere in the hash string', async () => {
    const hash = await hashPassword('vitiwai-secret-phrase');
    expect(hash).not.toContain('vitiwai');
    expect(hash).not.toContain('secret');
  });

  it('refuses a malformed hash rather than throwing', async () => {
    expect(await verifyPassword('anything', 'not-a-real-hash')).toBe(false);
    expect(await verifyPassword('anything', '')).toBe(false);
  });

  it('refuses an empty password at hashing time', async () => {
    await expect(hashPassword('')).rejects.toThrow(/password/i);
  });
});
