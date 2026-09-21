/**
 * A result that carries its failure in the type.
 *
 * Every port returns one. A route handler therefore cannot ignore that an
 * outside system failed: the compiler will not let it read `.value` until it
 * has dealt with the other branch. An exception would have let the failure
 * become an unhandled 500 three layers up.
 */

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok;

export const unwrapOr = <T, E>(r: Result<T, E>, fallback: T): T => (r.ok ? r.value : fallback);

/** Applies a function to a success, leaving a failure untouched. */
export const mapOk = <T, U, E>(r: Result<T, E>, f: (value: T) => U): Result<U, E> =>
  r.ok ? ok(f(r.value)) : r;

/** The shape every port's error takes. `kind` is what callers branch on. */
export interface PortError<K extends string = string> {
  readonly kind: K;
  readonly message: string;
  readonly cause?: unknown;
}
