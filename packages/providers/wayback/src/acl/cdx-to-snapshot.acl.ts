import type { CdxResponse } from '../endpoints/cdx-snapshots.js';

export interface WaybackSnapshotSummary {
	/** Number of distinct snapshots returned in the requested window. */
	readonly snapshotCount: number;
	/** ISO-8601 timestamp of the most recent snapshot, or null when none. */
	readonly latestSnapshotAt: string | null;
	/** ISO-8601 timestamp of the earliest snapshot in the window. */
	readonly earliestSnapshotAt: string | null;
	/** Distinct status-code counts (e.g. `{ "200": 12, "301": 1 }`). */
	readonly statusCodeBreakdown: Record<string, number>;
}

const CDX_HEADER_ROW_LENGTH = 7;
const CDX_HEADER_PREFIX = 'urlkey';

/**
 * Anti-Corruption Layer: turns a raw CDX response (array-of-arrays with the
 * first row as column headers) into a typed summary the rank-tracking /
 * project-management contexts consume. CDX timestamps are UTC strings of
 * shape `YYYYMMDDhhmmss` — we widen to ISO-8601 here so the rest of the
 * stack can use `Date` directly.
 *
 * Pure function: no I/O, no logging.
 */
export const summariseCdxResponse = (raw: CdxResponse): WaybackSnapshotSummary => {
	const dataRows = stripHeader(raw);
	if (dataRows.length === 0) {
		return {
			snapshotCount: 0,
			latestSnapshotAt: null,
			earliestSnapshotAt: null,
			statusCodeBreakdown: {},
		};
	}

	let latest: string | null = null;
	let earliest: string | null = null;
	const statusBreakdown: Record<string, number> = {};

	for (const row of dataRows) {
		const timestamp = row[1];
		const statusCode = row[4];
		if (typeof timestamp === 'string' && /^\d{14}$/.test(timestamp)) {
			if (latest === null || timestamp > latest) latest = timestamp;
			if (earliest === null || timestamp < earliest) earliest = timestamp;
		}
		if (typeof statusCode === 'string' && statusCode.length > 0) {
			statusBreakdown[statusCode] = (statusBreakdown[statusCode] ?? 0) + 1;
		}
	}

	return {
		snapshotCount: dataRows.length,
		latestSnapshotAt: latest ? cdxTimestampToIso(latest) : null,
		earliestSnapshotAt: earliest ? cdxTimestampToIso(earliest) : null,
		statusCodeBreakdown: statusBreakdown,
	};
};

const stripHeader = (raw: CdxResponse): CdxResponse => {
	if (raw.length === 0) return raw;
	const first = raw[0];
	if (first && first.length === CDX_HEADER_ROW_LENGTH && first[0] === CDX_HEADER_PREFIX) {
		return raw.slice(1);
	}
	return raw;
};

const cdxTimestampToIso = (raw: string): string => {
	const yyyy = raw.slice(0, 4);
	const mm = raw.slice(4, 6);
	const dd = raw.slice(6, 8);
	const hh = raw.slice(8, 10);
	const min = raw.slice(10, 12);
	const ss = raw.slice(12, 14);
	return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}.000Z`;
};
