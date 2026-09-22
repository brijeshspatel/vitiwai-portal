import { describe, expect, it } from 'vitest';
import { formatDate, formatMonth } from '@/domain/dates';

describe('dates as a customer reads them', () => {
  it('turns a due date into words', () => {
    expect(formatDate('2026-09-22')).toBe('22 September 2026');
  });

  it('turns a usage month into words', () => {
    expect(formatMonth('2026-07')).toBe('July 2026');
  });

  it('formats a full timestamp by its date', () => {
    expect(formatDate('2026-01-05T23:14:57.604Z')).toBe('5 January 2026');
  });

  it('does not shift the day for a reader east of Greenwich', () => {
    // Fiji is UTC+12. A date-only value parsed as local time and formatted in
    // another zone can land on the day before, which on a due date matters.
    expect(formatDate('2026-01-01')).toBe('1 January 2026');
    expect(formatDate('2026-12-31')).toBe('31 December 2026');
  });

  it('returns the value unchanged when it cannot be parsed', () => {
    // Printing "Invalid Date" on a bill is worse than printing the raw value.
    expect(formatDate('not a date')).toBe('not a date');
    expect(formatMonth('nonsense')).toBe('nonsense');
  });

  it('returns an empty string for nothing, rather than the word null', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatMonth('')).toBe('');
  });

  it('does not depend on the machine’s default locale', () => {
    // The formatter names en-GB explicitly. If it were left to the runtime, this
    // would pass on a developer's machine and produce 9/22/2026 on another.
    expect(formatDate('2026-09-22')).not.toMatch(/\d+\/\d+\/\d+/);
  });
});
