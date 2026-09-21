import { describe, expect, it } from 'vitest';
import { err, isErr, isOk, ok, unwrapOr } from '@/domain/result';

describe('Result carries failure in the type rather than by throwing', () => {
  it('narrows a success', () => {
    const r = ok(42);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(42);
  });

  it('narrows a failure', () => {
    const r = err({ kind: 'not_found' as const, message: 'no such customer' });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe('not_found');
  });

  it('falls back without unwrapping a failure', () => {
    expect(unwrapOr(ok(7), 0)).toBe(7);
    expect(unwrapOr(err({ kind: 'unavailable' as const, message: 'down' }), 0)).toBe(0);
  });
});
