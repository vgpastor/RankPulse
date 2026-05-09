import type { AclContext } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import type { DomainIntersectionItem, DomainIntersectionResponse } from '../endpoints/domain-intersection.js';

/**
 * Anti-Corruption Layer output: one row per keyword the competitor ranks for
 * that constitutes a gap relative to our domain. Speaks the
 * competitor-intelligence ubiquitous language while hiding the deeply-nested
 * DataForSEO Labs response shape.
 *
 * The output matches the input `IngestDomainIntersectionUseCase` expects
 * in `rows`.
 */
export interface DomainIntersectionRow {
	keyword: string;
	/** Our position in top-100, or null when we don't rank (the gap proper). */
	ourPosition: number | null;
	/** Competitor position in top-100. */
	theirPosition: number | null;
	searchVolume: number | null;
	cpc: number | null;
	keywordDifficulty: number | null;
}

/**
 * Maps a DataForSEO `domain_intersection/live` payload into normalised rows
 * ready for the competitor-intelligence ingest use case.
 *
 * Both `ourDomain` and `competitorDomain` come from `ctx.systemParams`. The
 * `IngestBinding` schema only models a single `systemParamKey`, so we pin
 * `ourDomain` as the binding's declared key (used by the router's
 * precondition guard) and read `competitorDomain` directly here — both are
 * required for the ACL to project rows correctly.
 *
 * Mapping convention (consistent with the endpoint's targets-order swap, see
 * `buildDomainIntersectionBody`):
 *   - `first_domain_serp_element`  → competitor (`theirPosition`)
 *   - `second_domain_serp_element` → our domain (`ourPosition`); often null
 *      under `intersection_mode: 'one_intersect'` because we deliberately ask
 *      for keywords where our domain doesn't rank.
 */
export const normaliseDomainIntersectionResponse = (
	response: DomainIntersectionResponse,
	ctx: AclContext,
): DomainIntersectionRow[] => {
	const ourDomain = ctx.systemParams.ourDomain;
	const competitorDomain = ctx.systemParams.competitorDomain;
	if (typeof ourDomain !== 'string' || ourDomain.trim() === '') {
		throw new InvalidInputError(
			'domain-intersection ACL requires `systemParams.ourDomain` (stamped by the auto-schedule handler). ' +
				'A schedule without it is misconfigured.',
		);
	}
	if (typeof competitorDomain !== 'string' || competitorDomain.trim() === '') {
		throw new InvalidInputError(
			'domain-intersection ACL requires `systemParams.competitorDomain` (stamped by the auto-schedule handler). ' +
				'A schedule without it is misconfigured.',
		);
	}
	const items = response.tasks?.[0]?.result?.[0]?.items ?? [];
	const out: DomainIntersectionRow[] = [];
	for (const item of items) {
		const row = projectItem(item);
		if (row) out.push(row);
	}
	return out;
};

const projectItem = (item: DomainIntersectionItem): DomainIntersectionRow | null => {
	const keyword = item.keyword_data?.keyword;
	if (typeof keyword !== 'string' || keyword.trim() === '') return null;
	const competitorRank =
		item.first_domain_serp_element?.rank_absolute ?? item.first_domain_serp_element?.rank_group ?? null;
	const ourRank =
		item.second_domain_serp_element?.rank_absolute ?? item.second_domain_serp_element?.rank_group ?? null;
	return {
		keyword,
		ourPosition: typeof ourRank === 'number' && ourRank > 0 ? ourRank : null,
		theirPosition: typeof competitorRank === 'number' && competitorRank > 0 ? competitorRank : null,
		searchVolume: numberOrNull(item.keyword_data?.keyword_info?.search_volume),
		cpc: numberOrNull(item.keyword_data?.keyword_info?.cpc),
		keywordDifficulty: numberOrNull(item.keyword_data?.keyword_properties?.keyword_difficulty),
	};
};

const numberOrNull = (v: number | null | undefined): number | null =>
	typeof v === 'number' && Number.isFinite(v) ? v : null;
