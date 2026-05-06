import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import type { BrevoHttp } from '../http.js';

/**
 * `GET /emailCampaigns/{campaignId}` — full campaign object including the
 * embedded `statistics.globalStats` block. Brevo doesn't expose a campaign-
 * stats-only sub-resource so we accept the cost of pulling the whole
 * object (a few KB) and let the ACL pluck what we care about.
 *
 * Cron defaults to daily so an active campaign's open/click curve is
 * captured day by day; for one-shot campaigns operators usually disable
 * the job once the curve has plateaued.
 */
export const CampaignStatisticsParams = z.object({
	campaignId: z.union([
		z.number().int().positive(),
		z.string().regex(/^\d+$/, 'campaignId must be a positive integer'),
	]),
});
export type CampaignStatisticsParams = z.infer<typeof CampaignStatisticsParams>;

export const campaignStatisticsDescriptor: EndpointDescriptor = {
	id: 'brevo-campaign-statistics',
	category: 'traffic',
	displayName: 'Brevo — email campaign statistics',
	description:
		'Per-campaign performance (sent/delivered/opens/clicks/bounces/unsubscribes) for a specific Brevo campaign id. Daily cron — disable when the campaign curve flattens.',
	paramsSchema: CampaignStatisticsParams,
	cost: { unit: 'usd_cents', amount: 0 },
	defaultCron: '0 7 * * *',
	rateLimit: { max: 60, durationMs: 60_000 },
};

/**
 * Brevo nests cumulative stats under `statistics.globalStats` and per-link
 * breakdowns under `statistics.linksStats`. We type the bits we actually
 * map; the rest of the campaign envelope passes through as `unknown` so
 * the raw payload remains a faithful snapshot.
 */
export interface CampaignGlobalStats {
	uniqueClicks?: number;
	clickers?: number;
	complaints?: number;
	delivered?: number;
	sent?: number;
	softBounces?: number;
	hardBounces?: number;
	uniqueViews?: number;
	trackableViews?: number;
	estimatedViews?: number;
	unsubscriptions?: number;
	viewed?: number;
	deferred?: number;
	returnBounce?: number;
}

export interface CampaignStatisticsResponse {
	id?: number;
	name?: string;
	subject?: string;
	type?: string;
	status?: string;
	statistics?: {
		globalStats?: CampaignGlobalStats;
		campaignStats?: unknown;
		mirrorClick?: unknown;
		remaining?: unknown;
		linksStats?: unknown;
		statsByDomain?: unknown;
		statsByDevice?: unknown;
		statsByBrowser?: unknown;
	};
}

export const fetchCampaignStatistics = async (
	http: BrevoHttp,
	params: CampaignStatisticsParams,
	ctx: FetchContext,
): Promise<CampaignStatisticsResponse> => {
	const id = String(params.campaignId);
	const raw = (await http.get(
		`/emailCampaigns/${encodeURIComponent(id)}`,
		{},
		ctx.credential.plaintextSecret,
		ctx.signal,
	)) as CampaignStatisticsResponse;
	return raw ?? {};
};
