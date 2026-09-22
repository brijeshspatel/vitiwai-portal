import { describe, expect, it } from 'vitest';
import {
  changePlanSchema,
  firstProblem,
  onboardingSchema,
  paymentSchema,
  signInSchema,
  supportSchema,
} from '@/security/schemas';

/**
 * What each handler will and will not accept.
 *
 * Each case asserts an acceptance beside its rejection: a schema that refused
 * everything would satisfy the rejections on its own.
 */

describe('sign-in', () => {
  it('accepts a well-formed submission', () => {
    expect(signInSchema.safeParse({ email: 'a@b.test', password: 'secret' }).success).toBe(true);
  });
  it('refuses an empty password', () => {
    expect(signInSchema.safeParse({ email: 'a@b.test', password: '' }).success).toBe(false);
  });
  it('refuses a missing field', () => {
    expect(signInSchema.safeParse({ email: 'a@b.test' }).success).toBe(false);
  });
});

describe('payment', () => {
  const valid = {
    invoiceId: '42',
    amountMinor: '2250',
    instrument: 'pm_test_ok',
    idempotencyKey: 'key-1',
  };
  it('accepts integer minor units as a string, because FormData carries strings', () => {
    const parsed = paymentSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.amountMinor).toBe(2250);
  });
  it('refuses a fractional amount rather than rounding it', () => {
    // Floating-point currency is the defect the money rules exist to prevent.
    expect(paymentSchema.safeParse({ ...valid, amountMinor: '22.50' }).success).toBe(false);
  });
  it('refuses a negative or zero amount', () => {
    expect(paymentSchema.safeParse({ ...valid, amountMinor: '-100' }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...valid, amountMinor: '0' }).success).toBe(false);
  });
  it('refuses an instrument the gateway does not understand', () => {
    expect(paymentSchema.safeParse({ ...valid, instrument: 'pm_live_visa' }).success).toBe(false);
  });
});

describe('onboarding', () => {
  const valid = {
    fullName: 'ANA MEREANI NAIQAMA',
    dateOfBirth: '1991-03-14',
    documentNumber: 'FJ7481239',
    email: 'ana@example.test',
    password: 'a-long-enough-passphrase',
  };
  it('accepts a complete application', () => {
    expect(onboardingSchema.safeParse(valid).success).toBe(true);
  });
  it('refuses a date that is not a date', () => {
    expect(onboardingSchema.safeParse({ ...valid, dateOfBirth: '14 March 1991' }).success).toBe(false);
  });
  it('refuses a password too short to be one', () => {
    expect(onboardingSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false);
  });
  it('refuses an address that is not an address', () => {
    expect(onboardingSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);
  });
});

describe('support and plan change', () => {
  it('accepts a report and refuses an empty one', () => {
    expect(supportSchema.safeParse({ title: 'No water', description: 'Since Tuesday.' }).success).toBe(true);
    expect(supportSchema.safeParse({ title: '   ', description: 'Since Tuesday.' }).success).toBe(false);
  });
  it('accepts a plan and refuses an empty one', () => {
    expect(changePlanSchema.safeParse({ planId: 'plan-bundle-2' }).success).toBe(true);
    expect(changePlanSchema.safeParse({ planId: '' }).success).toBe(false);
  });
  it('refuses a description long enough to be a payload', () => {
    expect(supportSchema.safeParse({ title: 'x', description: 'y'.repeat(4001) }).success).toBe(false);
  });
});

describe('the message an applicant sees', () => {
  it('names the field and says nothing about paths or types', () => {
    const parsed = signInSchema.safeParse({ email: 'a@b.test', password: '' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const message = firstProblem(parsed.error);
      expect(message).toContain('password');
      expect(message).not.toMatch(/ZodError|invalid_type|undefined/);
    }
  });
});
