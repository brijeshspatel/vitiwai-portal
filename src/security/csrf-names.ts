/**
 * The names the cookie, the field and the header go by.
 *
 * They live apart from `csrf.ts` because **middleware runs on the Edge
 * runtime**, which has no `node:crypto`. Importing the constants from a module
 * that imports `randomBytes` pulls the whole module in, and the build succeeds
 * while every request fails:
 *
 *     Failed to load external module node:crypto:
 *     TypeError: Native module not found: node:crypto
 *
 * That was a 500 on every page, from a build that reported no error. Anything
 * middleware imports has to be safe on the Edge runtime, and the cheapest way
 * to guarantee that is to give it a module with no imports at all.
 */

export const CSRF_COOKIE = 'vitiwai_csrf';
export const CSRF_FIELD = '_csrf';

/** The header middleware forwards the token on, so the render can read it. */
export const CSRF_HEADER = 'x-csrf-token';
