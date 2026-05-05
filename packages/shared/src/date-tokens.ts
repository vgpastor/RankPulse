import { InvalidInputError } from './errors.js';

/**
 * BACKLOG #22 — pure resolver for relative date tokens used in scheduled
 * provider params. The processor calls `resolveDateTokens(value, now)`
 * right before invoking the provider so a job persisted as
 * `endDate: "{{today-2}}"` becomes `endDate: "2026-05-03"` at fetch time.
 *
 * Why a separate util and not a Zod transform: the value lives in the
 * persisted JobDefinition and must be re-resolved every cron tick — we
 * never mutate it on save. The Zod schema's job is to ACCEPT the token,
 * not to evaluate it.
 *
 * Lives in `shared` because both the application layer (use cases) and
 * the worker (processor) need it; placing it in either would force a
 * cross-context import.
 *
 * Timezone: every resolution is UTC. The token semantics are
 * "N calendar days before today (UTC)", not "N×24h before now". The
 * worker always runs UTC; cron schedules are written in UTC; this is
 * the only consistent choice.
 */

const ABSOLUTE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TODAY_TOKEN = /^\{\{today(?:-(\d+))?\}\}$/;

export const isDateToken = (value: string): boolean => TODAY_TOKEN.test(value);

export const isAbsoluteDate = (value: string): boolean => ABSOLUTE_DATE.test(value);

/**
 * Pattern that any field accepting "absolute date OR relative token" should
 * match. Exposed for Zod schemas in contracts so they don't have to
 * reimplement the regex.
 */
export const DATE_OR_TOKEN_REGEX = /^(\d{4}-\d{2}-\d{2}|\{\{today(?:-\d+)?\}\})$/;

const formatYmdUtc = (date: Date): string => {
	const y = date.getUTCFullYear();
	const m = String(date.getUTCMonth() + 1).padStart(2, '0');
	const d = String(date.getUTCDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
};

/**
 * Resolves a single date string. Returns the input unchanged if it is
 * already an absolute date; substitutes `{{today}}` / `{{today-N}}` with
 * the corresponding UTC calendar date. Throws InvalidInputError on
 * malformed tokens (so the worker can fail the run with a clear cause
 * instead of producing silently-wrong dates).
 */
export const resolveDateToken = (value: string, now: Date): string => {
	if (ABSOLUTE_DATE.test(value)) return value;
	const match = TODAY_TOKEN.exec(value);
	if (!match) {
		throw new InvalidInputError(
			`Invalid date token "${value}" — expected "YYYY-MM-DD" or "{{today}}" / "{{today-N}}"`,
		);
	}
	const offsetDays = match[1] ? Number.parseInt(match[1], 10) : 0;
	if (Number.isNaN(offsetDays) || offsetDays < 0) {
		throw new InvalidInputError(`Invalid date token "${value}" — offset must be a non-negative integer`);
	}
	const resolved = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offsetDays));
	return formatYmdUtc(resolved);
};

/**
 * Walks an arbitrary params object and substitutes date tokens in any
 * string field. Non-string and non-date-shaped values pass through
 * unchanged. Returns a new object — does NOT mutate the input.
 *
 * Recursion handles nested objects (e.g. some providers expect
 * `dateRange: { startDate, endDate }`); arrays are walked element-wise.
 */
export const resolveDateTokens = <T>(value: T, now: Date): T => {
	if (typeof value === 'string') {
		return (TODAY_TOKEN.test(value) ? resolveDateToken(value, now) : value) as T;
	}
	if (Array.isArray(value)) {
		return value.map((item) => resolveDateTokens(item, now)) as T;
	}
	if (value !== null && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			out[k] = resolveDateTokens(v, now);
		}
		return out as T;
	}
	return value;
};
