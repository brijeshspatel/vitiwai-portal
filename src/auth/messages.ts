/**
 * One message for both sign-in failures.
 *
 * Telling an unknown email apart from a wrong password tells an attacker which
 * addresses have accounts here. The cost of the ambiguity is a slightly less
 * helpful error; the cost of the alternative is an enumeration oracle.
 */
export const SIGNIN_FAILED = 'That email address and password do not match an account.';
