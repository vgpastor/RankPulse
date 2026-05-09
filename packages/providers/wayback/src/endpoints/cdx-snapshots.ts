import type { EndpointDescriptor, FetchContext, HttpClient } from '@rankpulse/provider-core';
import { z } from 'zod';

/**
 * Wayback Machine CDX Server search.
 * https://archive.org/web/researcher/cdx_legend.php
 *
 * Returns one row per archived snapshot of a URL within the date window.
 * `urlPrefix` matches by URL prefix when `matchType=prefix` (default), so
 * passing `example.com` alone targets the bare domain; pass `example.com/`
 * + `matchType=prefix` to capture the entire site. We always force
 * `matchType=prefix` for the Competitor Activity Radar use case — operator
 * cares about "is this competitor still touching their site?", not about
 * a specific URL.
 *
 * Date format: `YYYYMMDD` (or `YYYYMMDDHH` for hourly). The worker resolves
 * `{{today-N}}` tokens before dispatch (BACKLOG #22).
 */
export const CdxSnapshotsParams = z.object({
	domain: z.string().min(3).max(253),
	from: z.string().regex(/^\d{8}(?:\d{2})?$|^\{\{today(?:-\d+)?\}\}$/),
	to: z.string().regex(/^\d{8}(?:\d{2})?$|^\{\{today(?:-\d+)?\}\}$/),
	limit: z.coerce.number().int().min(1).max(10_000).default(2_000),
});
export type CdxSnapshotsParams = z.infer<typeof CdxSnapshotsParams>;

/**
 * Wayback CDX is a free public API. Cost is bookkeeping-only so the
 * api_usage ledger has a row; pinned to 0 cents. Rate-limit is generous
 * (the Internet Archive does not publish a hard cap, but ~30 req/s is
 * polite per the robot policy guidance).
 */
export const CDX_SNAPSHOTS_COST_CENTS = 0;

export const cdxSnapshotsDescriptor: EndpointDescriptor = {
	id: 'wayback-cdx-snapshots',
	category: 'brand',
	displayName: 'Wayback Machine — CDX snapshots count',
	description:
		'Counts archived snapshots of a competitor domain within a date window via the Wayback CDX Server. Used by the Competitor Activity Radar to detect when a rival ships site changes.',
	paramsSchema: CdxSnapshotsParams,
	cost: { unit: 'usd_cents', amount: CDX_SNAPSHOTS_COST_CENTS },
	defaultCron: '0 5 * * 1',
	rateLimit: { max: 30, durationMs: 1_000 },
};

/**
 * CDX Server returns either:
 *   1. An empty body (zero snapshots) — handled in the HTTP client.
 *   2. A JSON array of arrays where row [0] is column headers and rows
 *      [1..N] are snapshot data.
 *
 * Column order with `output=json` (no fl override): `urlkey, timestamp,
 * original, mimetype, statuscode, digest, length`.
 */
export type CdxRow = readonly [string, string, string, string, string, string, string];
export type CdxResponse = readonly CdxRow[];

const buildPath = (): string => '/cdx/search/cdx';

const buildQuery = (params: CdxSnapshotsParams): Record<string, string> => ({
	url: params.domain,
	matchType: 'prefix',
	output: 'json',
	from: params.from,
	to: params.to,
	limit: String(params.limit),
});

export const fetchCdxSnapshots = async (
	http: HttpClient,
	params: CdxSnapshotsParams,
	ctx: FetchContext,
): Promise<CdxResponse> => {
	const raw = (await http.get<unknown>(buildPath(), buildQuery(params), ctx)) as
		| CdxResponse
		| null
		| undefined;
	if (!raw || !Array.isArray(raw)) {
		ctx.logger.warn('Wayback CDX response missing or not an array', {});
		return [];
	}
	return raw;
};
