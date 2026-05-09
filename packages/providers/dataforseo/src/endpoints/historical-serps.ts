import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import { type DataForSeoHttp, ensureTaskOk } from '../http.js';

/**
 * Issue #130: DataForSEO Labs `historical_serps/live` returns the monthly
 * historical top-100 Google SERP for a single keyword over up to 12 months.
 *
 * Powers retroactive analysis: when did we lose/gain positions, when did a
 * Google update reshape the niche, when did a new competitor enter? Reserved
 * for priority keywords (top ~30 tracked) given the cost.
 *
 * Raw-only ingest by design: payload lands in `raw_payloads` and is consumed
 * on demand. No hypertable, no read model — yet.
 */
// TODO(claude #130): Verify against canonical DataForSEO docs whether
// date_from / date_to are inclusive and if the upstream caps the window at
// 12 months. Best-read sourced from issue brief.
export const HistoricalSerpsParams = z.object({
	keyword: z.string().min(1).max(700),
	locationCode: z.number().int().min(1).max(99_999_999),
	languageCode: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
	/** Inclusive lower bound, YYYY-MM-DD. Defaults upstream to ~12 months ago. */
	dateFrom: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	/** Inclusive upper bound, YYYY-MM-DD. Defaults upstream to today. */
	dateTo: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
});
export type HistoricalSerpsParams = z.infer<typeof HistoricalSerpsParams>;

/**
 * DataForSEO charges ~$0.05 per call for this endpoint. Flat 5 cents declared;
 * the upstream's reported `cost` reconciles via the api_usage ledger.
 */
export const HISTORICAL_SERPS_COST_CENTS = 5;

export const historicalSerpsDescriptor: EndpointDescriptor = {
	id: 'dataforseo-labs-historical-serps',
	category: 'rankings',
	displayName: 'DataForSEO Labs — historical SERPs',
	description:
		'Monthly historical Google top-100 SERP for a keyword over up to 12 months. Retroactively detects ranking shifts, Google update impact, and new competitor entries.',
	paramsSchema: HistoricalSerpsParams,
	cost: { unit: 'usd_cents', amount: HISTORICAL_SERPS_COST_CENTS },
	// Monthly refresh on the 5th at 06:00 UTC. Reserved for priority keywords
	// (top ~30 tracked) given the per-call cost.
	defaultCron: '0 6 5 * *',
	rateLimit: { max: 2_000, durationMs: 60_000 },
};

const PATH = '/v3/dataforseo_labs/google/historical_serps/live';

export interface HistoricalSerpsResultElement {
	type?: string;
	rank_group?: number | null;
	rank_absolute?: number | null;
	url?: string | null;
	domain?: string | null;
	title?: string | null;
}

export interface HistoricalSerpsMonthlySnapshot {
	year?: number;
	month?: number;
	check_url?: string | null;
	items?: HistoricalSerpsResultElement[];
}

export interface HistoricalSerpsResponse {
	status_code: number;
	status_message: string;
	cost?: number;
	tasks?: Array<{
		status_code: number;
		status_message: string;
		result?: Array<{
			keyword?: string;
			location_code?: number;
			language_code?: string;
			items?: HistoricalSerpsMonthlySnapshot[];
		}>;
	}>;
}

export const buildHistoricalSerpsBody = (params: HistoricalSerpsParams): unknown[] => {
	const entry: Record<string, unknown> = {
		keyword: params.keyword,
		location_code: params.locationCode,
		language_code: params.languageCode,
	};
	if (params.dateFrom !== undefined) entry.date_from = params.dateFrom;
	if (params.dateTo !== undefined) entry.date_to = params.dateTo;
	return [entry];
};

export const fetchHistoricalSerps = async (
	http: DataForSeoHttp,
	params: HistoricalSerpsParams,
	ctx: FetchContext,
): Promise<HistoricalSerpsResponse> => {
	const body = buildHistoricalSerpsBody(params);
	const raw = (await http.post(
		PATH,
		body,
		ctx.credential.plaintextSecret,
		ctx.signal,
	)) as HistoricalSerpsResponse;
	ensureTaskOk(PATH, raw);
	return raw;
};
