import type {
	AuthStrategy,
	EndpointManifest,
	IngestBinding,
	ProviderManifest,
} from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import { summariseBacklinksResponse } from './acl/backlinks-summary.acl.js';
import { normaliseDomainIntersectionResponse } from './acl/domain-intersection-to-domain.acl.js';
import { normaliseRankedKeywordsResponse } from './acl/ranked-keywords-to-domain.acl.js';
import { parseCredential } from './credential.js';
import {
	type BacklinksSummaryResponse,
	backlinksSummaryDescriptor,
	fetchBacklinksSummary,
} from './endpoints/backlinks-summary.js';
import { competitorsDomainDescriptor, fetchCompetitorsDomain } from './endpoints/competitors-domain.js';
import {
	type DomainIntersectionResponse,
	domainIntersectionDescriptor,
	fetchDomainIntersection,
} from './endpoints/domain-intersection.js';
import {
	domainWhoisOverviewDescriptor,
	fetchDomainWhoisOverview,
} from './endpoints/domain-whois-overview.js';
import { fetchKeywordDifficulty, keywordDifficultyDescriptor } from './endpoints/keyword-difficulty.js';
import {
	fetchKeywordsDataSearchVolume,
	keywordsDataSearchVolumeDescriptor,
} from './endpoints/keywords-data-search-volume.js';
import { fetchKeywordsForSite, keywordsForSiteDescriptor } from './endpoints/keywords-for-site.js';
import { fetchOnPageInstantPages, onPageInstantDescriptor } from './endpoints/on-page-instant.js';
import {
	fetchRankedKeywords,
	type RankedKeywordsResponse,
	rankedKeywordsDescriptor,
} from './endpoints/ranked-keywords.js';
import { fetchRelatedKeywords, relatedKeywordsDescriptor } from './endpoints/related-keywords.js';
import {
	fetchSerpGoogleOrganicAdvanced,
	serpGoogleOrganicAdvancedDescriptor,
} from './endpoints/serp-google-organic-advanced.js';
import {
	fetchSerpGoogleOrganicLive,
	serpGoogleOrganicLiveDescriptor,
} from './endpoints/serp-google-organic-live.js';
import { buildLegacyShim, DataForSeoHttpClient } from './http.js';

const auth: AuthStrategy = { kind: 'basic' };

/**
 * Adapts an existing `fetchX(http: DataForSeoHttp, ...)` helper to the
 * manifest's `(http: HttpClient, params, ctx) => Promise<R>` signature.
 *
 * `BaseHttpClient` already owns auth + signal + JSON parse, but the helpers
 * still wrap the HTTP call with `ensureTaskOk` (DataForSEO returns HTTP 200
 * with body `status_code` for task-level errors). The shim preserves that
 * task-level error mapping until Phase 5 inlines the helpers into the
 * manifest fetch closures.
 *
 * `params` arrives typed as `unknown` from the IngestRouter (which only
 * trusts what zod validated upstream). Each helper expects its specific
 * param shape; the `as TParams` cast is safe because the worker validates
 * `definition.params` against `descriptor.paramsSchema` BEFORE invoking
 * `fetch`. A malformed payload would have failed before reaching here.
 */
const adapt =
	<TParams, TResponse>(
		helper: (
			http: ReturnType<typeof buildLegacyShim>,
			params: TParams,
			ctx: Parameters<typeof buildLegacyShim>[1],
		) => Promise<TResponse>,
	): EndpointManifest<unknown, unknown>['fetch'] =>
	async (http, params, ctx) => {
		// IngestRouter constructs ONE `DataForSeoHttpClient` per provider at
		// composition time and reuses it across all endpoint fetches; the
		// runtime cast here is safe because the manifest's HTTP config and
		// the registered client are siblings produced from the same factory.
		const shim = buildLegacyShim(http as DataForSeoHttpClient, ctx);
		return helper(shim, params as TParams, ctx);
	};

/**
 * SERP rank extraction for the IngestRouter path. The current OLD processor
 * fans out one SERP across N tracked-keyword domains (BACKLOG #15). Phase 5
 * is expected to schedule one definition per `trackedKeywordId` so the
 * rows-per-call collapses to 1 — which is what this ACL produces.
 *
 * `systemParams.domain` is the per-schedule target domain stamped by the
 * Auto-Schedule handler when the operator tracks a keyword. Returns the
 * single ranking observation; an empty array means the schedule was
 * misconfigured (no domain) and the IngestRouter precondition guard will
 * reject before reaching the use case.
 */

/**
 * Issue #127: typed ingest binding for the Labs `ranked_keywords/live`
 * endpoint. The router pumps each row through `IngestRankedKeywordsUseCase`,
 * which persists into the `ranked_keywords_observations` hypertable. The
 * `targetDomain` system param is stamped at scheduling time (currently the
 * scheduler call site supplies it; auto-schedule wiring is a follow-up).
 */
const rankTrackingRankedKeywordsIngest: IngestBinding<RankedKeywordsResponse> = {
	useCaseKey: 'rank-tracking:ingest-ranked-keywords',
	systemParamKey: 'targetDomain',
	acl: normaliseRankedKeywordsResponse,
};

/**
 * Issue #128: typed ingest binding for the Labs `domain_intersection/live`
 * endpoint. The router pumps each row through
 * `IngestDomainIntersectionUseCase`, which persists into the
 * `competitor_keyword_gaps` hypertable.
 *
 * `IngestBinding` only supports a single `systemParamKey`, so we declare
 * `ourDomain` (the precondition the router asserts before dispatch). The ACL
 * additionally reads `competitorDomain` directly from `ctx.systemParams` —
 * both are required for the row mapping to be meaningful.
 */
const competitorIntelligenceDomainIntersectionIngest: IngestBinding<DomainIntersectionResponse> = {
	useCaseKey: 'competitor-intelligence:ingest-domain-intersection',
	systemParamKey: 'ourDomain',
	acl: normaliseDomainIntersectionResponse,
};

const endpoints: readonly EndpointManifest[] = [
	{
		descriptor: serpGoogleOrganicLiveDescriptor,
		fetch: adapt(fetchSerpGoogleOrganicLive),
		// Ranking observations stay router-bypass: the processor's legacy
		// if-else fans ONE SERP fetch out across N tracked-keyword domains
		// (BACKLOG #15) — `1 fetch → N rows of the same shape` is exactly
		// what the IngestRouter does NOT model. The fan-out reads the
		// project's tracked keywords + competitor list and emits
		// per-domain RankingObservations, plus seeds CompetitorSuggestion
		// candidates from top-10 (BACKLOG #18). When Phase 5 lands the
		// `1 def per trackedKeywordId` schedule shape (so rows-per-call
		// collapses to 1), `rankTrackingIngest` can be wired back here.
		// Until then, leaving this set crashes the worker bootstrap with
		// `IngestRouter: no IngestUseCase registered for key
		// 'rank-tracking:record-ranking-observation'` because the
		// fan-out pipeline has no use-case registered against the router
		// key (it's executed inline against the use case object).
		ingest: null,
	},
	{
		descriptor: serpGoogleOrganicAdvancedDescriptor,
		fetch: adapt(fetchSerpGoogleOrganicAdvanced),
		// Same router-bypass rationale as serp-google-organic-live above.
		ingest: null,
	},
	{
		descriptor: keywordsDataSearchVolumeDescriptor,
		fetch: adapt(fetchKeywordsDataSearchVolume),
		// Raw-only today; the keyword-volume read model materialises from the
		// raw_payloads table on demand. Phase 5+ may add a typed ingest.
		ingest: null,
	},
	{
		descriptor: keywordDifficultyDescriptor,
		fetch: adapt(fetchKeywordDifficulty),
		ingest: null,
	},
	{
		descriptor: keywordsForSiteDescriptor,
		fetch: adapt(fetchKeywordsForSite),
		ingest: null,
	},
	{
		descriptor: relatedKeywordsDescriptor,
		fetch: adapt(fetchRelatedKeywords),
		ingest: null,
	},
	{
		descriptor: competitorsDomainDescriptor,
		fetch: adapt(fetchCompetitorsDomain),
		ingest: null,
	},
	{
		descriptor: domainIntersectionDescriptor,
		fetch: adapt(fetchDomainIntersection),
		// Issue #128: typed ingest path. The auto-schedule (or manual
		// scheduler call) stamps `ourDomain` + `competitorDomain` into
		// systemParams so the ACL can validate them and the ingest use case
		// can persist them once per batch.
		ingest: competitorIntelligenceDomainIntersectionIngest as IngestBinding,
	},
	{
		descriptor: rankedKeywordsDescriptor,
		fetch: adapt(fetchRankedKeywords),
		// Issue #127: typed ingest path. The auto-schedule (or manual
		// scheduler call) stamps `targetDomain` into systemParams so the
		// ACL can validate it and the ingest use case can persist it once
		// per batch instead of denormalising onto every row.
		ingest: rankTrackingRankedKeywordsIngest as IngestBinding,
	},
	{
		descriptor: domainWhoisOverviewDescriptor,
		fetch: adapt(fetchDomainWhoisOverview),
		ingest: null,
	},
	{
		descriptor: onPageInstantDescriptor,
		fetch: adapt(fetchOnPageInstantPages),
		ingest: null,
	},
	{
		descriptor: backlinksSummaryDescriptor,
		fetch: adapt(fetchBacklinksSummary),
		// Issue #117 Sprint 2 — Competitor Activity Radar. The ACL produces
		// ONE summary row per fetch; the IngestRouter routes it to the
		// project-management context using the `competitorId` carried in
		// systemParams (set by the auto-schedule handler when an operator
		// wires a competitor for activity tracking).
		ingest: {
			useCaseKey: 'project-management:record-competitor-backlinks-profile',
			systemParamKey: 'competitorId',
			acl: (response: BacklinksSummaryResponse) => [summariseBacklinksResponse(response)],
		} as IngestBinding,
	},
];

export const dataforseoProviderManifest: ProviderManifest = {
	id: 'dataforseo',
	displayName: 'DataForSEO',
	http: {
		baseUrl: 'https://api.dataforseo.com',
		auth,
		defaultTimeoutMs: 60_000,
	},
	validateCredentialPlaintext(plaintextSecret: string): void {
		// `parseCredential` throws InvalidInputError on the wrong shape (must be
		// `email|api_password` with a non-empty password). Re-thrown as-is so
		// `RegisterProviderCredentialUseCase` surfaces a 400 at registration.
		try {
			parseCredential(plaintextSecret);
		} catch (err) {
			if (err instanceof InvalidInputError) throw err;
			throw new InvalidInputError(
				'DataForSEO credential must be in the format "email|api_password" (pipe-separated).',
			);
		}
	},
	endpoints,
	buildHttpClient: (http) => new DataForSeoHttpClient(http),
};
