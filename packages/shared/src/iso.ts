/**
 * Serialises a `Date` to ISO-8601, defaulting to the epoch when the input
 * is an invalid `Date` (e.g. `new Date(NaN)` or a `MIN`/`MAX` aggregate
 * over an empty result set). Use whenever a `Date` flowed in from raw
 * SQL or an external boundary and the caller can't guarantee validity —
 * `Date.toISOString()` throws on invalid dates, which would otherwise
 * cascade into a 500.
 */
export const safeIso = (d: Date): string =>
	Number.isFinite(d.getTime()) ? d.toISOString() : new Date(0).toISOString();
