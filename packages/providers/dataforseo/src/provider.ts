import { ProviderConnectivity } from '@rankpulse/domain';
import type { EndpointDescriptor, FetchContext, Provider } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import { parseCredential } from './credential.js';
import {
	type CompetitorsDomainParams,
	competitorsDomainDescriptor,
	fetchCompetitorsDomain,
} from './endpoints/competitors-domain.js';
import {
	type DomainWhoisOverviewParams,
	domainWhoisOverviewDescriptor,
	fetchDomainWhoisOverview,
} from './endpoints/domain-whois-overview.js';
import {
	fetchKeywordDifficulty,
	type KeywordDifficultyParams,
	keywordDifficultyDescriptor,
} from './endpoints/keyword-difficulty.js';
import {
	fetchKeywordsDataSearchVolume,
	type KeywordsDataSearchVolumeParams,
	keywordsDataSearchVolumeDescriptor,
} from './endpoints/keywords-data-search-volume.js';
import {
	fetchKeywordsForSite,
	type KeywordsForSiteParams,
	keywordsForSiteDescriptor,
} from './endpoints/keywords-for-site.js';
import {
	fetchOnPageInstantPages,
	type OnPageInstantParams,
	onPageInstantDescriptor,
} from './endpoints/on-page-instant.js';
import {
	fetchRelatedKeywords,
	type RelatedKeywordsParams,
	relatedKeywordsDescriptor,
} from './endpoints/related-keywords.js';
import {
	fetchSerpGoogleOrganicAdvanced,
	type SerpGoogleOrganicAdvancedParams,
	serpGoogleOrganicAdvancedDescriptor,
} from './endpoints/serp-google-organic-advanced.js';
import {
	fetchSerpGoogleOrganicLive,
	type SerpGoogleOrganicLiveParams,
	serpGoogleOrganicLiveDescriptor,
} from './endpoints/serp-google-organic-live.js';
import { buildLegacyShim, DataForSeoHttp, DataForSeoHttpClient, type DataForSeoHttpOptions } from './http.js';

const ENDPOINTS: readonly EndpointDescriptor[] = [
	serpGoogleOrganicLiveDescriptor,
	serpGoogleOrganicAdvancedDescriptor,
	keywordsDataSearchVolumeDescriptor,
	keywordDifficultyDescriptor,
	keywordsForSiteDescriptor,
	relatedKeywordsDescriptor,
	competitorsDomainDescriptor,
	domainWhoisOverviewDescriptor,
	onPageInstantDescriptor,
];

const DEFAULT_BASE_URL = 'https://api.dataforseo.com';

/**
 * Legacy adapter for `Provider` (the deprecated class-based interface). The
 * NEW manifest path is `dataforseoProviderManifest` in `./manifest.js`, used
 * by Phase 5's IngestRouter; this class still drives the OLD worker
 * processor and composition-root registration until Phase 7 deletes it.
 *
 * Internally it now constructs a `DataForSeoHttpClient` (same auth +
 * timeouts as the manifest), wrapped with `buildLegacyShim` so the existing
 * `fetchX(http: DataForSeoHttp, ...)` helpers keep their signature
 * unchanged. Pass `fetchImpl` for tests to fall back to the older direct
 * `DataForSeoHttp` (which honours the `fetchImpl` injection point).
 */
export class DataForSeoProvider implements Provider {
	readonly id = ProviderConnectivity.ProviderId.create('dataforseo');
	readonly displayName = 'DataForSEO';
	readonly authStrategy = 'basic' as const;

	private readonly client: DataForSeoHttpClient | null;
	private readonly legacyHttp: DataForSeoHttp | null;

	constructor(options?: DataForSeoHttpOptions) {
		// `fetchImpl` injection (used by spec tests) bypasses the new
		// BaseHttpClient stack. When absent (production code path), we
		// route through `DataForSeoHttpClient` so auth/timeout/error
		// handling matches the manifest-driven IngestRouter path.
		if (options?.fetchImpl !== undefined) {
			this.legacyHttp = new DataForSeoHttp(options);
			this.client = null;
		} else {
			this.client = new DataForSeoHttpClient({
				baseUrl: options?.baseUrl ?? DEFAULT_BASE_URL,
				auth: { kind: 'basic' },
				defaultTimeoutMs: 60_000,
			});
			this.legacyHttp = null;
		}
	}

	discover(): readonly EndpointDescriptor[] {
		return ENDPOINTS;
	}

	validateCredentialPlaintext(plaintextSecret: string): void {
		parseCredential(plaintextSecret);
	}

	async fetch(endpointId: string, params: unknown, ctx: FetchContext): Promise<unknown> {
		// Constructor invariant: exactly one of `legacyHttp` / `client` is set.
		const http = this.legacyHttp ?? (this.client ? buildLegacyShim(this.client, ctx) : null);
		if (!http) {
			throw new Error('DataForSeoProvider misconfigured: neither legacy nor BaseHttpClient instantiated');
		}
		// Each branch validates with the descriptor's own zod schema before
		// dispatching — the worker also validates at scheduling time, this is
		// a defensive second pass in case a malformed JobDefinition slipped in.
		switch (endpointId) {
			case serpGoogleOrganicLiveDescriptor.id:
				return await fetchSerpGoogleOrganicLive(
					http,
					this.parseParams(serpGoogleOrganicLiveDescriptor, params) as SerpGoogleOrganicLiveParams,
					ctx,
				);
			case serpGoogleOrganicAdvancedDescriptor.id:
				return await fetchSerpGoogleOrganicAdvanced(
					http,
					this.parseParams(serpGoogleOrganicAdvancedDescriptor, params) as SerpGoogleOrganicAdvancedParams,
					ctx,
				);
			case keywordsDataSearchVolumeDescriptor.id:
				return await fetchKeywordsDataSearchVolume(
					http,
					this.parseParams(keywordsDataSearchVolumeDescriptor, params) as KeywordsDataSearchVolumeParams,
					ctx,
				);
			case keywordDifficultyDescriptor.id:
				return await fetchKeywordDifficulty(
					http,
					this.parseParams(keywordDifficultyDescriptor, params) as KeywordDifficultyParams,
					ctx,
				);
			case keywordsForSiteDescriptor.id:
				return await fetchKeywordsForSite(
					http,
					this.parseParams(keywordsForSiteDescriptor, params) as KeywordsForSiteParams,
					ctx,
				);
			case relatedKeywordsDescriptor.id:
				return await fetchRelatedKeywords(
					http,
					this.parseParams(relatedKeywordsDescriptor, params) as RelatedKeywordsParams,
					ctx,
				);
			case competitorsDomainDescriptor.id:
				return await fetchCompetitorsDomain(
					http,
					this.parseParams(competitorsDomainDescriptor, params) as CompetitorsDomainParams,
					ctx,
				);
			case domainWhoisOverviewDescriptor.id:
				return await fetchDomainWhoisOverview(
					http,
					this.parseParams(domainWhoisOverviewDescriptor, params) as DomainWhoisOverviewParams,
					ctx,
				);
			case onPageInstantDescriptor.id:
				return await fetchOnPageInstantPages(
					http,
					this.parseParams(onPageInstantDescriptor, params) as OnPageInstantParams,
					ctx,
				);
			default:
				throw new InvalidInputError(`DataForSEO has no endpoint "${endpointId}"`);
		}
	}

	private parseParams(descriptor: EndpointDescriptor, raw: unknown): unknown {
		const parsed = descriptor.paramsSchema.safeParse(raw);
		if (!parsed.success) {
			throw new InvalidInputError(`Invalid params for ${descriptor.id}: ${parsed.error.message}`);
		}
		return parsed.data;
	}
}
