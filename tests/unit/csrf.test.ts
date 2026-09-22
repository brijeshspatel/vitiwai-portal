import { describe, expect, it } from 'vitest';
import { CSRF_COOKIE, CSRF_FIELD, mintToken, tokensMatch } from '@/security/csrf';

/**
 * The token comparison, on its own.
 *
 * It is a separate module from the middleware so it can be tested without a
 * request: the comparison is the part that decides whether a mutation is
 * accepted, and it should not need a framework to exercise.
 */

describe('minting a token', () => {
  it('produces a token long enough to be unguessable', () => {
    // 32 random bytes, base64url encoded. Shorter than 32 characters would mean
    // fewer than 192 bits and is worth failing over.
    expect(mintToken().length).toBeGreaterThanOrEqual(32);
  });

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 200 }, () => mintToken()));
    expect(seen.size).toBe(200);
  });

  it('is safe to put in a cookie and a form field without escaping', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(mintToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

describe('comparing a token', () => {
  it('accepts a token that matches the cookie', () => {
    const token = mintToken();
    expect(tokensMatch(token, token)).toBe(true);
  });

  it('rejects a different token', () => {
    expect(tokensMatch(mintToken(), mintToken())).toBe(false);
  });

  it('rejects a missing form field', () => {
    expect(tokensMatch(mintToken(), undefined)).toBe(false);
    expect(tokensMatch(mintToken(), '')).toBe(false);
  });

  it('rejects a missing cookie', () => {
    // Without this, a client that simply sent no cookie would be comparing
    // nothing against nothing, which an equality check would call a match.
    expect(tokensMatch(undefined, mintToken())).toBe(false);
    expect(tokensMatch('', '')).toBe(false);
  });

  it('rejects a token of a different length without throwing', () => {
    // timingSafeEqual throws on unequal lengths. A handler that let that
    // propagate would answer 500 to a malformed token instead of rejecting it.
    const token = mintToken();
    expect(() => tokensMatch(token, `${token}extra`)).not.toThrow();
    expect(tokensMatch(token, `${token}extra`)).toBe(false);
    expect(tokensMatch(token, token.slice(0, 8))).toBe(false);
  });

  it('names the cookie and the field once, for everything that uses them', () => {
    expect(CSRF_COOKIE).toBe('vitiwai_csrf');
    expect(CSRF_FIELD).toBe('_csrf');
  });
});
