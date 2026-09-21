import { describe, expect, it } from 'vitest';
import { addMinor, formatFJD, toMinorUnits } from '@/domain/money';

describe('money is held in integer minor units', () => {
  it('converts major units to minor units', () => {
    expect(toMinorUnits(12.34)).toBe(1234);
  });

  it('does not inherit binary floating-point error', () => {
    // 0.1 + 0.2 is 0.30000000000000004. A naive `Math.round(x * 100)` on the
    // product of a float chain is exactly how a cent goes missing from a bill.
    expect(toMinorUnits(0.1 + 0.2)).toBe(30);
  });

  it('formats minor units as Fijian dollars', () => {
    expect(formatFJD(1234)).toBe('FJ$12.34');
    expect(formatFJD(0)).toBe('FJ$0.00');
    expect(formatFJD(5)).toBe('FJ$0.05');
  });

  it('adds without drift across many operations', () => {
    let total = 0;
    for (let i = 0; i < 1000; i += 1) total = addMinor(total, toMinorUnits(0.01));
    expect(total).toBe(1000);
    expect(formatFJD(total)).toBe('FJ$10.00');
  });

  it('refuses a non-finite amount rather than producing NaN silently', () => {
    expect(() => toMinorUnits(Number.NaN)).toThrow(/finite/i);
    expect(() => toMinorUnits(Number.POSITIVE_INFINITY)).toThrow(/finite/i);
  });
});
