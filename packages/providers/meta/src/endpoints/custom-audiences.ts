import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import type { MetaHttp } from '../http.js';

/**
 * `/act_{ad-account-id}/customaudiences` lists the custom audiences attached
 * to an ad account. This is an inventory call — we run it weekly to capture
 * the audience catalogue so the operator can see which segments exist; we
 * don't time-series the size estimates because Meta only exposes a wide
 * `approximate_count_*_bound` band that's noisy day-over-day.
 *
 * The raw payload is persisted by the worker like any other endpoint;
 * downstream consumers can read it from `raw_payloads` until we add a
 * dedicated read model.
 */
const AdAccountIdRegex = /^(act_)?\d+$/;

export const CustomAudiencesParams = z.object({
	adAccountId: z.string().regex(AdAccountIdRegex, 'adAccountId must be numeric or "act_<digits>"'),
	limit: z.number().int().min(1).max(500).default(100),
});
export type CustomAudiencesParams = z.infer<typeof CustomAudiencesParams>;

export const customAudiencesDescriptor: EndpointDescriptor = {
	id: 'meta-custom-audiences',
	category: 'brand',
	displayName: 'Meta Custom Audiences',
	description:
		'Inventory of custom audiences for a Meta ad account (id, name, subtype, approximate size band). Weekly snapshot; free under Marketing API; requires ads_read.',
	paramsSchema: CustomAudiencesParams,
	cost: { unit: 'usd_cents', amount: 0 },
	defaultCron: '0 5 * * 1',
	rateLimit: { max: 60, durationMs: 60_000 },
};

export interface CustomAudienceRow {
	id?: string;
	name?: string;
	subtype?: string;
	approximate_count_lower_bound?: number;
	approximate_count_upper_bound?: number;
	delivery_status?: { code?: number; description?: string };
}
export interface CustomAudiencesResponse {
	data?: CustomAudienceRow[];
	paging?: { cursors?: { before?: string; after?: string }; next?: string };
}

const FIELDS = [
	'id',
	'name',
	'subtype',
	'approximate_count_lower_bound',
	'approximate_count_upper_bound',
	'delivery_status',
] as const;

const normalizeAdAccountId = (raw: string): string => (raw.startsWith('act_') ? raw : `act_${raw}`);

export const fetchCustomAudiences = async (
	http: MetaHttp,
	params: CustomAudiencesParams,
	ctx: FetchContext,
): Promise<CustomAudiencesResponse> => {
	const account = normalizeAdAccountId(params.adAccountId);
	const path = `/${encodeURIComponent(account)}/customaudiences`;
	const raw = (await http.get(
		path,
		{ fields: FIELDS.join(','), limit: String(params.limit) },
		ctx.credential.plaintextSecret,
		ctx.signal,
	)) as CustomAudiencesResponse;
	return raw;
};
