/**
 * Dates as a customer reads them.
 *
 * The portal showed `2026-09-22` as a due date and `2026-07` as a usage month,
 * which are storage formats. A bill that says "Due 2026-09-22" reads like a
 * system record rather than a statement to a person.
 *
 * `en-GB` is a **formatting choice, not localisation**. The site declares
 * `lang="en-FJ"` and there is no translation here; `en-GB` is named explicitly
 * because it is the form that was measured, and because relying on the runtime's
 * default locale would make the output depend on the machine rendering it.
 * Verified on Node 26 with ICU 78.3: `22 September 2026` and `September 2026`.
 *
 * Every function returns the input unchanged when it cannot parse it. A date
 * that will not parse is a data problem, and printing `Invalid Date` on a bill
 * is worse than printing the raw value.
 */

const LOCALE = 'en-GB';

const DAY = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const MONTH = new Intl.DateTimeFormat(LOCALE, {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** `2026-09-22` or an ISO timestamp becomes `22 September 2026`. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  // Date-only strings are parsed as UTC by the platform, and the formatter is
  // pinned to UTC, so a date never shifts by a day for a reader east of Greenwich.
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return DAY.format(parsed);
}

/** `2026-07` becomes `July 2026`. */
export function formatMonth(value: string | null | undefined): string {
  if (!value) return '';
  const parsed = new Date(/^\d{4}-\d{2}$/.test(value) ? `${value}-01T00:00:00Z` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return MONTH.format(parsed);
}
