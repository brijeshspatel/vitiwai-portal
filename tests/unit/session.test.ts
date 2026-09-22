import { describe, expect, it } from 'vitest';
import { expiryFrom, isExpired, newSessionId, SESSION_HOURS } from '@/auth/session';

describe('session identifiers', () => {
  it('carries 256 bits of entropy', () => {
    // 32 bytes as base64url is 43 characters with no padding.
    expect(newSessionId()).toHaveLength(43);
    expect(newSessionId()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('differs every time', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newSessionId()));
    expect(ids.size).toBe(200);
  });

  it('encodes nothing about the user', () => {
    // Nothing to assert positively, so assert the shape: an opaque id has no
    // separators a payload would need.
    expect(newSessionId()).not.toContain('.');
    expect(newSessionId()).not.toContain(':');
  });
});

describe('expiry', () => {
  const now = new Date('2026-09-22T10:00:00Z');

  it('is absolute at twelve hours', () => {
    expect(SESSION_HOURS).toBe(12);
    expect(expiryFrom(now).toISOString()).toBe('2026-09-22T22:00:00.000Z');
  });

  it('treats the exact expiry moment as expired', () => {
    expect(isExpired(expiryFrom(now), new Date('2026-09-22T22:00:00Z'))).toBe(true);
  });

  it('accepts a session one second before expiry', () => {
    expect(isExpired(expiryFrom(now), new Date('2026-09-22T21:59:59Z'))).toBe(false);
  });

  it('rejects one a second after', () => {
    expect(isExpired(expiryFrom(now), new Date('2026-09-22T22:00:01Z'))).toBe(true);
  });
});
