/**
 * Money is an integer count of minor units - cents of one Fijian dollar.
 *
 * Nothing in this module ever holds a currency amount in a float. A bill that
 * is out by one cent is a defect a customer will find before a test does.
 */

declare const minorUnitBrand: unique symbol;

/** An integer number of cents. The brand stops a bare number being passed by mistake. */
export type Money = number & { readonly [minorUnitBrand]: 'FJD' };

/** Converts an amount in dollars to cents, rounding half away from zero. */
export function toMinorUnits(major: number): Money {
  if (!Number.isFinite(major)) {
    throw new RangeError(`an amount must be finite, received ${String(major)}`);
  }
  // Round before trusting the product: 0.1 + 0.2 is 0.30000000000000004, and
  // 0.30000000000000004 * 100 is 30.000000000000004, which truncates to 30 but
  // floors to 29 under a different rounding choice. Rounding here removes the
  // question rather than answering it differently in each caller.
  const sign = major < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(major) * 100)) as Money;
}

/** Adds two amounts. Both are integers, so this cannot drift. */
export function addMinor(a: Money | number, b: Money | number): Money {
  return (a + b) as Money;
}

/** Subtracts `b` from `a`. */
export function subtractMinor(a: Money | number, b: Money | number): Money {
  return (a - b) as Money;
}

/** Renders an amount for display. Never used for arithmetic. */
export function formatFJD(amount: Money | number): string {
  const negative = amount < 0;
  const absolute = Math.abs(amount);
  const dollars = Math.trunc(absolute / 100);
  const cents = absolute % 100;
  return `${negative ? '-' : ''}FJ$${dollars}.${String(cents).padStart(2, '0')}`;
}

/** Reads an amount Odoo returned as a float, which is the only place floats are tolerated. */
export function fromOdooFloat(value: number): Money {
  return toMinorUnits(value);
}
