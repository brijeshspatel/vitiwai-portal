/**
 * The security headers, built in one place.
 *
 * One module so the middleware that sends them and the test that asserts them
 * cannot disagree: a test that builds its own expectation from a second copy of
 * the list passes while the two drift apart.
 *
 * Three of these predate increment 1E and were set in next.config.mjs. They are
 * listed here so the set is visible at once, and the test asserts the whole set
 * rather than the part this increment added.
 */

/**
 * A policy with no `unsafe-inline` in `script-src`.
 *
 * The application emits 6 to 11 inline scripts per route - React's hydration
 * and streaming payloads - so a policy without `unsafe-inline` needs a nonce,
 * and Next stamps every one of its own inline scripts with the nonce it finds
 * on the request. Measured before this was written: 11 of 11 on /plans, no
 * violation reported by the browser, and streaming completed.
 *
 * `strict-dynamic` lets a script the nonce already trusts load the chunks it
 * needs, which is how the framework's own loader works. Without it the policy
 * would have to name every chunk, and chunk names change with every build.
 *
 * `style-src` keeps `unsafe-inline`, and that is a real limitation rather than
 * an oversight: Next inlines critical CSS as a `<style>` element with no nonce,
 * so removing it would leave every page unstyled. It is recorded in the runbook
 * and in the completion report rather than quietly accepted.
 */
export function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ');
}

/**
 * Everything that is not the policy.
 *
 * These are set by `next.config.mjs`, not by middleware, because they do not
 * vary per request and that layer also covers static assets - middleware's
 * matcher excludes them deliberately, to keep it off the asset path. The list
 * is here so one test can assert the whole set, and so a reader can see every
 * header in one place without knowing which layer sends each.
 */
export const STATIC_SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  // Tells a browser not to hand this origin's pages any camera, microphone or
  // location permission. The portal asks for none of them.
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()'],
];
