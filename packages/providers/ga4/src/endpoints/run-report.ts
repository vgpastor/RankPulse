import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { DATE_OR_TOKEN_REGEX } from '@rankpulse/shared';
import { z } from 'zod';
import type { Ga4Http } from '../http.js';

/**
 * GA4 Data API v1beta is generally available despite the version label.
 * Quotas are per-property tokenized:
 *   - 200 000 core tokens / property / day
 *   - 1 250 concurrent requests / property
 * A single `runReport` consumes ~10 tokens depending on dimension count,
 * which gives us plenty of room for a daily cron at low cardinality.
 *
 * Property IDs are numeric; we accept the `properties/123456` form too
 * because that's what GA4's UI shows in the property picker.
 */
const PropertyIdRegex = /^(properties\/)?\d+$/;

const DimensionName = z
	.string()
	.min(1)
	.max(64)
	.regex(/^[a-zA-Z][a-zA-Z0-9_]*$/);
const MetricName = z
	.string()
	.min(1)
	.max(64)
	.regex(/^[a-zA-Z][a-zA-Z0-9_]*$/);

export const RunReportParams = z.object({
	propertyId: z.string().regex(PropertyIdRegex, 'propertyId must be numeric or "properties/<id>"'),
	startDate: z.string().regex(DATE_OR_TOKEN_REGEX),
	endDate: z.string().regex(DATE_OR_TOKEN_REGEX),
	dimensions: z.array(DimensionName).min(1).max(9).default(['date']),
	metrics: z
		.array(MetricName)
		.min(1)
		.max(10)
		.default(['sessions', 'totalUsers', 'screenPageViews', 'engagedSessions']),
	rowLimit: z.number().int().min(1).max(100_000).default(10_000),
	offset: z.number().int().min(0).default(0),
	keepEmptyRows: z.boolean().default(false),
});
export type RunReportParams = z.infer<typeof RunReportParams>;

export const runReportDescriptor: EndpointDescriptor = {
	id: 'ga4-run-report',
	category: 'rankings',
	displayName: 'GA4 Run Report',
	description:
		'Real GA4 traffic metrics (sessions, users, pageviews, engagement, conversions) sliced by configurable dimensions. Free; 200k tokens/day/property.',
	paramsSchema: RunReportParams,
	cost: { unit: 'usd_cents', amount: 0 },
	defaultCron: '0 4 * * *', // daily 04:00 UTC, after GSC's 05:00 lag tolerance
	rateLimit: { max: 60, durationMs: 60_000 },
};

export interface DimensionHeader {
	name: string;
}
export interface MetricHeader {
	name: string;
	type?: string;
}
export interface RunReportRow {
	dimensionValues?: { value?: string; oneValue?: 'value' }[];
	metricValues?: { value?: string }[];
}
export interface RunReportResponse {
	dimensionHeaders?: DimensionHeader[];
	metricHeaders?: MetricHeader[];
	rows?: RunReportRow[];
	rowCount?: number;
	metadata?: { currencyCode?: string; timeZone?: string };
}

const normalizePropertyId = (raw: string): string =>
	raw.startsWith('properties/') ? raw : `properties/${raw}`;

export const fetchRunReport = async (
	http: Ga4Http,
	params: RunReportParams,
	ctx: FetchContext,
): Promise<RunReportResponse> => {
	const property = normalizePropertyId(params.propertyId);
	const path = `/v1beta/${property}:runReport`;
	const body = {
		dateRanges: [{ startDate: params.startDate, endDate: params.endDate }],
		dimensions: params.dimensions.map((name) => ({ name })),
		metrics: params.metrics.map((name) => ({ name })),
		limit: String(params.rowLimit),
		offset: String(params.offset),
		keepEmptyRows: params.keepEmptyRows,
	};
	const raw = (await http.post(path, body, ctx.credential.plaintextSecret, ctx.signal)) as RunReportResponse;
	return raw;
};
