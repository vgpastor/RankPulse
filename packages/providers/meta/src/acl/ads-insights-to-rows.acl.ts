import type { AdsInsightsResponse } from '../endpoints/ads-insights.js';

/**
 * Domain-shaped row coming out of `/insights`. One row per
 * (observed_date, level, entity_id) — `entityId` is the campaign/adset/ad id
 * depending on the request `level`. We fold actions into a single
 * `conversions` total summed across the conversion-shaped action types
 * (purchase + offsite_conversion.fb_pixel_purchase + lead are the canonical
 * three; the codebase can tune the set without touching the schema).
 */
export interface NormalizedAdsInsightRow {
	observedDate: string; // YYYY-MM-DD
	level: 'account' | 'campaign' | 'adset' | 'ad';
	entityId: string;
	entityName: string;
	impressions: number;
	clicks: number;
	spend: number; // USD (Meta's reporting currency for the account)
	conversions: number;
}

const CONVERSION_ACTION_TYPES = new Set<string>([
	'purchase',
	'offsite_conversion.fb_pixel_purchase',
	'omni_purchase',
	'lead',
	'offsite_conversion.fb_pixel_lead',
	'complete_registration',
]);

const isYyyyMmDd = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);

const toIntegerCount = (raw: string | undefined): number => {
	if (raw === undefined || raw === null || raw === '') return 0;
	const n = Number(raw);
	return Number.isFinite(n) ? Math.round(n) : 0;
};

const toMoney = (raw: string | undefined): number => {
	if (raw === undefined || raw === null || raw === '') return 0;
	const n = Number(raw);
	return Number.isFinite(n) ? n : 0;
};

interface EntityRef {
	level: NormalizedAdsInsightRow['level'];
	id: string;
	name: string;
}

const pickEntity = (
	row: import('../endpoints/ads-insights.js').AdsInsightsRow,
	level: NormalizedAdsInsightRow['level'],
): EntityRef | null => {
	switch (level) {
		case 'account':
			return row.account_id ? { level, id: row.account_id, name: '' } : null;
		case 'campaign':
			return row.campaign_id ? { level, id: row.campaign_id, name: row.campaign_name ?? '' } : null;
		case 'adset':
			return row.adset_id ? { level, id: row.adset_id, name: row.adset_name ?? '' } : null;
		case 'ad':
			return row.ad_id ? { level, id: row.ad_id, name: row.ad_name ?? '' } : null;
		default:
			return null;
	}
};

const sumConversions = (
	actions: import('../endpoints/ads-insights.js').AdsInsightsAction[] | undefined,
): number => {
	if (!actions || actions.length === 0) return 0;
	let total = 0;
	for (const a of actions) {
		if (typeof a.action_type !== 'string') continue;
		if (!CONVERSION_ACTION_TYPES.has(a.action_type)) continue;
		const n = Number(a.value);
		if (Number.isFinite(n)) total += n;
	}
	return Math.round(total);
};

/**
 * Pure ACL: `/insights` payload → normalized rows. Skips rows lacking the
 * level's id (Meta occasionally returns a roll-up row at a higher level
 * even when `level=campaign` is requested; we drop them rather than fold
 * them into a synthetic id).
 */
export const extractAdsInsightRows = (
	response: AdsInsightsResponse,
	level: NormalizedAdsInsightRow['level'],
	fallbackDate: string,
): NormalizedAdsInsightRow[] => {
	const out: NormalizedAdsInsightRow[] = [];
	for (const row of response.data ?? []) {
		const entity = pickEntity(row, level);
		if (!entity) continue;
		const observedDate =
			typeof row.date_start === 'string' && isYyyyMmDd(row.date_start) ? row.date_start : fallbackDate;
		out.push({
			observedDate,
			level,
			entityId: entity.id,
			entityName: entity.name,
			impressions: toIntegerCount(row.impressions),
			clicks: toIntegerCount(row.clicks),
			spend: toMoney(row.spend),
			conversions: sumConversions(row.actions),
		});
	}
	return out;
};
