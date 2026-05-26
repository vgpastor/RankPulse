/**
 * Shared coercion helpers for raw `db.execute()` queries on top of the
 * postgres-js driver (3.4.x). Each helper papers over one mismatch
 * between what the driver returns and what the typed sql<…> template
 * (or the calling code) expects.
 *
 * Lives in a `utils/` namespace (NOT `shared-kernel`) because this is
 * infrastructure-specific — coupled to a particular driver version.
 * Moving to a different driver could obsolete the entire file.
 *
 * Why these are NOT inlined per-repo: the same bug surfaced 3 times in
 * production (issues #178, #179, #182) because each repo author had
 * to remember the postgres-js quirk independently. Centralising the
 * helper + sharing the comment makes the constraint discoverable from
 * any new repo via the import path.
 */

/**
 * Bridges the two postgres-js result shapes drizzle-orm can return —
 * `pg-core`'s `Result` exposes the rows on a `.rows` property, while the
 * `postgres` driver returns the array directly. Each read-model method
 * needs the array shape; centralising the cast keeps the SQL focus on
 * what's interesting (the query).
 */
export const unwrap = <T>(rows: unknown): T[] =>
	((rows as { rows?: unknown[] }).rows ?? (rows as unknown[])) as T[];

/**
 * postgres-js (3.4.x) returns timestamptz from raw `db.execute()` as the
 * original ISO string (e.g. `"2026-04-27 00:00:00+00"`), NOT a Date —
 * its built-in type parsers only kick in for the schema-typed query
 * builder. Use cases that call `.toISOString()` / `.getTime()` on the
 * resulting field throw `TypeError` → 500 unless the repo coerces here
 * at the boundary.
 *
 * Accept both shapes (`string | Date`) so the helper is safe to call
 * whether the driver eventually exposes a config to auto-parse or not —
 * a future-proofing for the day we upgrade and the type parsers DO
 * trigger for raw `execute`.
 */
export const toDate = (v: string | Date): Date => (v instanceof Date ? v : new Date(v));

/**
 * Nullable counterpart of `toDate`. Used by sub-queries that may produce
 * a NULL (no observation yet, no link, …).
 */
export const toDateOrNull = (v: string | Date | null | undefined): Date | null => {
	if (v === null || v === undefined) return null;
	return v instanceof Date ? v : new Date(v);
};
