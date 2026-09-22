import { headers } from 'next/headers';
import { CSRF_FIELD, CSRF_HEADER } from './csrf-names';

/**
 * The hidden field every mutating form carries.
 *
 * One component rather than six copies of the same two lines: a form that
 * forgets the field is rejected at the handler, which is safe but looks like a
 * bug to whoever meets it, and the cheapest way to stop that happening is to
 * give every form the same thing to include.
 *
 * The token comes from the request header middleware sets. Reading it here
 * rather than the cookie is deliberate - on the request that mints a new token
 * the cookie is only on the *response*, so the page would render an empty field
 * on a visitor's first page view and their first submission would be rejected.
 */
export async function CsrfField() {
  const token = (await headers()).get(CSRF_HEADER) ?? '';
  return <input type="hidden" name={CSRF_FIELD} value={token} />;
}

/**
 * The token, for a page to pass into a form component.
 *
 * `CsrfField` is an async server component, which cannot be rendered by a
 * synchronous test renderer. Form components that are unit-tested on their own -
 * the sign-in, checkout and onboarding forms - therefore take the token as a
 * prop and render the hidden input themselves, and the page awaits this. The
 * data flow is explicit and the components stay renderable in isolation.
 */
export async function csrfToken(): Promise<string> {
  return (await headers()).get(CSRF_HEADER) ?? '';
}
