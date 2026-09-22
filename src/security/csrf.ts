import { randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Cross-site request forgery protection, for forms that carry no JavaScript.
 *
 * The portal's forms are plain server-rendered `POST`s - a property increment
 * 1C established deliberately, so the customer can pay a bill with scripting
 * disabled. That rules out the usual double-submit pattern, which asks the page
 * to read the cookie and copy it into the request.
 *
 * Here the **server** does both halves. Middleware mints the token, forwards it
 * to the render on a request header, and sets it as a cookie; the page writes
 * the same value into a hidden field; the handler compares the two. Neither
 * half needs the browser to run anything.
 *
 * `SameSite=Lax` already blocks the common cross-site `POST`, and has since
 * increment 1C. It is not sufficient on its own - it does nothing for a
 * same-site injection, and a browser that does not honour it offers no
 * protection at all - which is why this exists as well rather than instead.
 */

// Re-exported so callers have one import, while middleware can take the names
// alone from a module that never touches node:crypto.
export { CSRF_COOKIE, CSRF_FIELD, CSRF_HEADER } from './csrf-names';

/** 32 random bytes, base64url so it needs no escaping in a cookie or a field. */
export function mintToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * True when the form field matches the cookie.
 *
 * Both values are compared in constant time, on equal-length buffers.
 * `timingSafeEqual` throws when the lengths differ, so the length is checked
 * first - a handler that let that throw would answer 500 to a malformed token
 * rather than rejecting it, turning a forgery attempt into an error page.
 */
export function tokensMatch(
  fromCookie: string | undefined,
  fromForm: string | undefined,
): boolean {
  if (!fromCookie || !fromForm) return false;

  const cookie = Buffer.from(fromCookie, 'utf8');
  const form = Buffer.from(fromForm, 'utf8');
  if (cookie.length !== form.length) return false;

  return timingSafeEqual(cookie, form);
}
