import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { DATE_OR_TOKEN_REGEX } from '@rankpulse/shared';
import { z } from 'zod';
import type { MetaHttp } from '../http.js';
import { normalizeAdAccountId } from '../util/normalize-ad-account-id.js';

/**
 * `/act_{ad-account-id}/insights` returns campaign / adset / ad performance
 * metrics. We pin `time_increment=1` so the response is bucketed by day —
 * the row's `date_start` is the calendar day; the ingest writes one row per
 * (account, day, level, entity_id).
 *
 * Spend comes back as a USD string (e.g. "12.34"); we forward it as-is and
 * let the ACL coerce. `actions` is a parallel array of `{action_type, value}`;
 * the ingest sums the conversion-shaped action types.
 */
const AdAccountIdRegex = /^(act_)?\d+$/;

const Level = z.enum(['account', 'campaign', 'adset', 'ad']);

export const AdsInsightsParams = z.object({
	adAccountId: z.string().regex(AdAccountIdRegex, 'adAccountId must be numeric or "act_<digits>"'),
	startDate: z.string().regex(DATE_OR_TOKEN_REGEX),
	endDate: z.string().regex(DATE_OR_TOKEN_REGEX),
	level: Level.default('campaign'),
	limit: z.number().int().min(1).max(500).default(250),
});
export type AdsInsightsParams = z.infer<typeof AdsInsightsParams>;

export const adsInsightsDescriptor: EndpointDescriptor = {
	id: 'meta-ads-insights',
	category: 'traffic',
	displayName: 'Meta Ads Insights',
	description:
		'Daily campaign / adset / ad insights (impressions, clicks, spend, conversions) for a Meta ad account. Free under Marketing API; requires ads_read.',
	paramsSchema: AdsInsightsParams,
	cost: { unit: 'usd_cents', amount: 0 },
	defaultCron: '45 4 * * *',
	rateLimit: { max: 60, durationMs: 60_000 },
};

export interface AdsInsightsAction {
	action_type?: string;
	value?: string;
}
export interface AdsInsightsRow {
	date_start?: string;
	date_stop?: string;
	account_id?: string;
	campaign_id?: string;
	campaign_name?: string;
	adset_id?: string;
	adset_name?: string;
	ad_id?: string;
	ad_name?: string;
	impressions?: string;
	clicks?: string;
	spend?: string;
	actions?: AdsInsightsAction[];
}
export interface AdsInsightsResponse {
	data?: AdsInsightsRow[];
	paging?: { cursors?: { before?: string; after?: string }; next?: string };
}

const FIELDS = [
	'account_id',
	'campaign_id',
	'campaign_name',
	'adset_id',
	'adset_name',
	'ad_id',
	'ad_name',
	'impressions',
	'clicks',
	'spend',
	'actions',
] as const;

export const fetchAdsInsights = async (
	http: MetaHttp,
	params: AdsInsightsParams,
	ctx: FetchContext,
): Promise<AdsInsightsResponse> => {
	const account = normalizeAdAccountId(params.adAccountId);
	const path = `/${encodeURIComponent(account)}/insights`;
	const raw = (await http.get(
		path,
		{
			fields: FIELDS.join(','),
			level: params.level,
			time_increment: '1',
			time_range: JSON.stringify({ since: params.startDate, until: params.endDate }),
			limit: String(params.limit),
		},
		ctx.credential.plaintextSecret,
		ctx.signal,
	)) as AdsInsightsResponse;
	return raw;
};
