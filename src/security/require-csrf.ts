import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { CSRF_COOKIE, CSRF_FIELD, tokensMatch } from './csrf';

/**
 * The guard every mutating handler calls before it acts.
 *
 * Returns `null` when the request carries a valid token, or the 403 to return
 * when it does not. Handlers read as:
 *
 *     const form = await request.formData();
 *     const rejected = await rejectIfForged(form);
 *     if (rejected) return rejected;
 *
 * It returns a response rather than throwing so a handler cannot accidentally
 * catch it and carry on, and it takes the parsed form rather than the request
 * because a body can only be read once.
 */
export async function rejectIfForged(form: FormData): Promise<NextResponse | null> {
  const cookie = (await cookies()).get(CSRF_COOKIE)?.value;
  const field = form.get(CSRF_FIELD);

  if (tokensMatch(cookie, typeof field === 'string' ? field : undefined)) return null;

  // No detail in the body. A forged request is told it was refused and nothing
  // about why, since the reason is only useful to whoever forged it.
  return new NextResponse('Request rejected.', {
    status: 403,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
