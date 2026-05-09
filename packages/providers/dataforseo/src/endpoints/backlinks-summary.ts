import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import { type DataForSeoHttp, ensureTaskOk } from '../http.js';

/**
 * `backlinks/summary/live` — single-call summary of a target's link graph.
 * Returns total backlinks, referring_domains, referring_pages, anchors and
 * a few quality signals. Used by the Competitor Activity Radar to detect
 * when a rival is shipping new link-building work.
 *
 * https://docs.dataforseo.com/v3/backlinks/summary/live/
 */
export const BacklinksSummaryParams = z.object({
	target: z.string().min(3).max(253),
	includeSubdomains: z.boolean().optional(),
});
export type BacklinksSummaryParams = z.infer<typeof BacklinksSummaryParams>;

/** $0.02/req per DataForSEO pricing as of 2026-Q2. */
export const BACKLINKS_SUMMARY_COST_CENTS = 2;

export const backlinksSummaryDescriptor: EndpointDescriptor = {
	id: 'dataforseo-backlinks-summary',
	category: 'backlinks',
	displayName: 'DataForSEO — backlinks summary',
	description:
		'Summary of a domain link graph (total backlinks, referring domains, anchors). One call per competitor; weekly cadence is enough for the activity radar.',
	paramsSchema: BacklinksSummaryParams,
	cost: { unit: 'usd_cents', amount: BACKLINKS_SUMMARY_COST_CENTS },
	defaultCron: '0 6 * * 1',
	rateLimit: { max: 2_000, durationMs: 60_000 },
};

const PATH = '/v3/backlinks/summary/live';

export interface BacklinksSummaryItem {
	target?: string;
	first_seen?: string;
	lost_date?: string | null;
	rank?: number;
	backlinks?: number;
	backlinks_spam_score?: number;
	crawled_pages?: number;
	info?: { server?: string; cms?: string | null };
	internal_links_count?: number;
	external_links_count?: number;
	broken_backlinks?: number;
	broken_pages?: number;
	referring_domains?: number;
	referring_domains_nofollow?: number;
	referring_main_domains?: number;
	referring_main_domains_nofollow?: number;
	referring_ips?: number;
	referring_subnets?: number;
	referring_pages?: number;
	referring_pages_nofollow?: number;
	referring_links_tld?: Record<string, number>;
	referring_links_types?: Record<string, number>;
	referring_links_attributes?: Record<string, number>;
	referring_links_platform_types?: Record<string, number>;
	referring_links_semantic_locations?: Record<string, number>;
	referring_links_countries?: Record<string, number>;
}

export interface BacklinksSummaryResponse {
	status_code: number;
	status_message: string;
	cost?: number;
	tasks?: Array<{
		status_code: number;
		status_message: string;
		result?: BacklinksSummaryItem[];
	}>;
}

export const buildBacklinksSummaryBody = (params: BacklinksSummaryParams): unknown[] => [
	{
		target: params.target,
		include_subdomains: params.includeSubdomains ?? true,
		internal_list_limit: 0,
		backlinks_status_type: 'live',
	},
];

export const fetchBacklinksSummary = async (
	http: DataForSeoHttp,
	params: BacklinksSummaryParams,
	ctx: FetchContext,
): Promise<BacklinksSummaryResponse> => {
	const body = buildBacklinksSummaryBody(params);
	const raw = (await http.post(
		PATH,
		body,
		ctx.credential.plaintextSecret,
		ctx.signal,
	)) as BacklinksSummaryResponse;
	ensureTaskOk(PATH, raw);
	return raw;
};
