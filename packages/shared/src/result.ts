export type Result<T, E = Error> = Ok<T> | Err<E>;

export interface Ok<T> {
	readonly ok: true;
	readonly value: T;
}

export interface Err<E> {
	readonly ok: false;
	readonly error: E;
}

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok;

export const unwrap = <T, E>(r: Result<T, E>): T => {
	if (r.ok) return r.value;
	throw r.error instanceof Error ? r.error : new Error(String(r.error));
};

export const map = <T, U, E>(r: Result<T, E>, fn: (v: T) => U): Result<U, E> => (r.ok ? ok(fn(r.value)) : r);

export const mapErr = <T, E, F>(r: Result<T, E>, fn: (e: E) => F): Result<T, F> =>
	r.ok ? r : err(fn(r.error));

export const andThen = <T, U, E>(r: Result<T, E>, fn: (v: T) => Result<U, E>): Result<U, E> =>
	r.ok ? fn(r.value) : r;
