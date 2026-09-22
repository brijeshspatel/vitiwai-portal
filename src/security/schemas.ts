import { z } from 'zod';

/**
 * What each mutating handler will accept, declared once.
 *
 * Every handler parses its input before acting on it. Before increment 1E they
 * read fields straight off the `FormData` with `String(form.get(...) ?? '')`,
 * which turns a missing field into an empty string and a wrong type into
 * `"[object File]"` - so a malformed request reached the database layer to be
 * rejected there, or not rejected at all.
 *
 * The schemas live together rather than beside each handler so the shapes can
 * be read against one another; a field named `title` in one place and `subject`
 * in another is visible here and invisible when they are six files apart.
 *
 * `FormData` values are strings or `File`s, so every schema starts from a
 * string and coerces deliberately where a number is wanted. None of them
 * accepts a `File` except the onboarding document, which is checked by
 * `validateUpload` against its magic bytes rather than its declared type.
 */

/** Trimmed, non-empty, and bounded so a field cannot carry a payload. */
const line = (max: number) => z.string().trim().min(1).max(max);

export const signInSchema = z.object({
  email: line(320),
  password: z.string().min(1).max(512),
  next: z.string().max(512).optional(),
});

export const onboardingSchema = z.object({
  fullName: line(200),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a date in the form YYYY-MM-DD'),
  documentNumber: line(64),
  email: z.string().trim().email().max(320),
  password: z.string().min(8, 'at least 8 characters').max(512),
});

export const paymentSchema = z.object({
  invoiceId: line(64),
  // Integer minor units. A float here is the defect increment 1A's money rules
  // exist to prevent, so the schema refuses one rather than rounding it.
  amountMinor: z.coerce.number().int().positive().max(100_000_000),
  instrument: z.enum(['pm_test_ok', 'pm_test_decline', 'pm_test_insufficient']),
  idempotencyKey: line(128),
});

export const supportSchema = z.object({
  title: line(200),
  description: line(4000),
});

export const changePlanSchema = z.object({
  planId: line(64),
});

/**
 * The first problem a schema found, in words an applicant can act on.
 *
 * Zod's own message names the path, which is what a developer wants and not
 * what belongs on a form. This keeps the field name and drops the rest.
 */
export function firstProblem(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Check the form and try again.';
  const field = issue.path.join('.') || 'the form';
  return `Check ${field}: ${issue.message.toLowerCase()}.`;
}
