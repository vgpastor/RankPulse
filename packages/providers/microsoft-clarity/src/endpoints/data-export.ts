import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import type { ClarityHttp } from '../http.js';

/**
 * `GET /project-live-insights` returns aggregated UX metrics for the last
 * `numOfDays` days (1-3 only — Microsoft's API caps it). The response is
 * a flat array of objects, each with one (dimension, metricName, value)
 * combination — we re-shape into per-day metric maps in the ACL.
 *
 * Cron is daily at 06:00 UTC with `numOfDays=1` because the free tier
 * allows only 10 req/day per project; running the descriptor with the
 * default keeps daily backfills idempotent against the previous day's
 * metric values.
 */
export const DataExportParams = z.object({
	numOfDays: z.number().int().min(1).max(3).default(1),
	// dimension1/2/3 supports: Browser, Device, OS, Country, Page, OperatingSystem, etc.
	// Keeping the API surface small for v1 — projects rarely change dimensions
	// in flight, and adding dims is a backwards-compatible change later.
	dimensions: z
		.array(z.enum(['Browser', 'Device', 'OS', 'Country', 'Page']))
		.max(3)
		.default([]),
});
export type DataExportParams = z.infer<typeof DataExportParams>;

export const dataExportDescriptor: EndpointDescriptor = {
	id: 'clarity-data-export',
	category: 'onpage',
	displayName: 'Microsoft Clarity Data Export',
	description:
		'Aggregated UX behavioral metrics (sessions, distinct users, rage clicks, dead clicks, scroll depth, engagement time) from a Clarity project. Free; 10 req/day/project.',
	paramsSchema: DataExportParams,
	cost: { unit: 'usd_cents', amount: 0 },
	defaultCron: '0 6 * * *',
	rateLimit: { max: 10, durationMs: 24 * 60 * 60 * 1000 },
};

/**
 * Clarity's response is verbose. Each entry has an `information` array
 * with one or more metric/value pairs. The shape is loose and Microsoft
 * may add fields, so we strictly type only what we read.
 */
export interface DataExportInformationItem {
	[k: string]: string | number | undefined;
}
export interface DataExportEntry {
	metricName?: string;
	information?: DataExportInformationItem[];
}
export type DataExportResponse = DataExportEntry[];

export const fetchDataExport = async (
	http: ClarityHttp,
	params: DataExportParams,
	ctx: FetchContext,
): Promise<DataExportResponse> => {
	const query: Record<string, string | string[]> = {
		numOfDays: String(params.numOfDays),
	};
	params.dimensions.forEach((dim, idx) => {
		query[`dimension${idx + 1}`] = dim;
	});
	const raw = (await http.get(
		'/project-live-insights',
		query,
		ctx.credential.plaintextSecret,
		ctx.signal,
	)) as DataExportResponse;
	return raw;
};
