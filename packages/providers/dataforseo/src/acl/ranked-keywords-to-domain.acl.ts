import type { AclContext } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import type { RankedKeywordsItem, RankedKeywordsResponse } from '../endpoints/ranked-keywords.js';

/**
 * Anti-Corruption Layer output: one row per keyword the target domain ranks
 * for. Speaks the rank-tracking ubiquitous language (keyword/position/etc.)
 * while hiding the deeply-nested DataForSEO Labs response shape.
 *
 * The output is the input `IngestRankedKeywordsUseCase` expects in `rows`.
 */
export interface RankedKeywordRow {
	keyword: string;
	position: number | null;
	rankingUrl: string | null;
	searchVolume: number | null;
	keywordDifficulty: number | null;
	trafficEstimate: number | null;
	cpc: number | null;
}

/**
 * Maps a DataForSEO `ranked_keywords/live` payload into normalized rows ready
 * for the rank-tracking ingest use case. The target domain comes from
 * `ctx.systemParams.targetDomain` (stamped at schedule time, ADR 0001) — we
 * do not echo it on each row because the use case persists it once at the
 * batch level.
 *
 * Items missing a keyword string are skipped (DataForSEO occasionally returns
 * placeholder rows on broad queries); items missing a position are kept with
 * `position: null` so the read model can still surface "tracked but unranked"
 * states if the SERP shifts.
 */
export const normaliseRankedKeywordsResponse = (
	response: RankedKeywordsResponse,
	ctx: AclContext,
): RankedKeywordRow[] => {
	const targetDomain = ctx.systemParams.targetDomain;
	if (typeof targetDomain !== 'string' || targetDomain.trim() === '') {
		throw new InvalidInputError(
			'ranked-keywords ACL requires `systemParams.targetDomain` (stamped by the auto-schedule handler). ' +
				'A schedule without it is misconfigured.',
		);
	}
	const items = response.tasks?.[0]?.result?.[0]?.items ?? [];
	const out: RankedKeywordRow[] = [];
	for (const item of items) {
		const row = projectItem(item);
		if (row) out.push(row);
	}
	return out;
};

const projectItem = (item: RankedKeywordsItem): RankedKeywordRow | null => {
	const keyword = item.keyword_data?.keyword;
	if (typeof keyword !== 'string' || keyword.trim() === '') return null;
	const serpItem = item.ranked_serp_element?.serp_item;
	const rank = serpItem?.rank_absolute ?? serpItem?.rank_group ?? null;
	return {
		keyword,
		position: typeof rank === 'number' && rank > 0 ? rank : null,
		rankingUrl: serpItem?.url ?? null,
		searchVolume: numberOrNull(item.keyword_data?.keyword_info?.search_volume),
		keywordDifficulty: numberOrNull(item.keyword_data?.keyword_properties?.keyword_difficulty),
		trafficEstimate: numberOrNull(serpItem?.etv),
		cpc: numberOrNull(item.keyword_data?.keyword_info?.cpc),
	};
};

const numberOrNull = (v: number | null | undefined): number | null =>
	typeof v === 'number' && Number.isFinite(v) ? v : null;
