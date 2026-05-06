import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import type { CloudflareRadarHttp } from '../http.js';

/**
 * `/radar/ranking/domain/{domain}` returns Cloudflare's global popularity
 * ranking for a domain — both the all-categories rank and per-category
 * splits when available. The `rankingType` query param is required:
 *   - `POPULAR` (default): traffic-popularity ranking, daily snapshot
 *   - `TRENDING_RISE` / `TRENDING_STEADY`: trending lists
 *
 * We always pull POPULAR for the macro-context use-case ("is our domain
 * gaining or losing global mindshare?"). Cron is monthly because the
 * underlying ranking is itself a 30-day rolling aggregation.
 */
const DomainRegex =
	/^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export const DomainRankParams = z.object({
	domain: z.string().regex(DomainRegex, 'must be a bare domain (no scheme, no path)'),
	rankingType: z.enum(['POPULAR', 'TRENDING_RISE', 'TRENDING_STEADY']).default('POPULAR'),
});
export type DomainRankParams = z.infer<typeof DomainRankParams>;

export const domainRankDescriptor: EndpointDescriptor = {
	id: 'radar-domain-rank',
	category: 'rankings',
	displayName: 'Cloudflare Radar Domain Rank',
	description:
		'Global popularity ranking for a domain via Cloudflare Radar (1.1.1.1 resolver telemetry). Free, monthly snapshot — useful as a macro-trend signal beside Google/Bing rankings.',
	paramsSchema: DomainRankParams,
	cost: { unit: 'usd_cents', amount: 0 },
	defaultCron: '0 7 1 * *', // 07:00 UTC on the 1st of each month
	rateLimit: { max: 60, durationMs: 60_000 },
};

export interface DomainRankCategoryRow {
	name?: string;
	rank?: number;
}
export interface DomainRankDetails {
	rank?: number;
	domain?: string;
	categories?: DomainRankCategoryRow[];
	bucket?: string;
}
export interface DomainRankResponse {
	success?: boolean;
	result?: {
		details_0?: DomainRankDetails;
		meta?: { lastUpdated?: string };
	};
}

export const fetchDomainRank = async (
	http: CloudflareRadarHttp,
	params: DomainRankParams,
	ctx: FetchContext,
): Promise<DomainRankResponse> => {
	const path = `/radar/ranking/domain/${encodeURIComponent(params.domain)}`;
	const raw = (await http.get(
		path,
		{ rankingType: params.rankingType, format: 'json' },
		ctx.credential.plaintextSecret,
		ctx.signal,
	)) as DomainRankResponse;
	return raw;
};
