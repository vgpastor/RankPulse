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
import { DataForSeoHttp, type DataForSeoHttpOptions } from './http.js';

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

export class DataForSeoProvider implements Provider {
	readonly id = ProviderConnectivity.ProviderId.create('dataforseo');
	readonly displayName = 'DataForSEO';
	readonly authStrategy = 'basic' as const;

	private readonly http: DataForSeoHttp;

	constructor(options?: DataForSeoHttpOptions) {
		this.http = new DataForSeoHttp(options);
	}

	discover(): readonly EndpointDescriptor[] {
		return ENDPOINTS;
	}

	validateCredentialPlaintext(plaintextSecret: string): void {
		parseCredential(plaintextSecret);
	}

	async fetch(endpointId: string, params: unknown, ctx: FetchContext): Promise<unknown> {
		// Each branch validates with the descriptor's own zod schema before
		// dispatching — the worker also validates at scheduling time, this is
		// a defensive second pass in case a malformed JobDefinition slipped in.
		switch (endpointId) {
			case serpGoogleOrganicLiveDescriptor.id:
				return await fetchSerpGoogleOrganicLive(
					this.http,
					this.parseParams(serpGoogleOrganicLiveDescriptor, params) as SerpGoogleOrganicLiveParams,
					ctx,
				);
			case serpGoogleOrganicAdvancedDescriptor.id:
				return await fetchSerpGoogleOrganicAdvanced(
					this.http,
					this.parseParams(serpGoogleOrganicAdvancedDescriptor, params) as SerpGoogleOrganicAdvancedParams,
					ctx,
				);
			case keywordsDataSearchVolumeDescriptor.id:
				return await fetchKeywordsDataSearchVolume(
					this.http,
					this.parseParams(keywordsDataSearchVolumeDescriptor, params) as KeywordsDataSearchVolumeParams,
					ctx,
				);
			case keywordDifficultyDescriptor.id:
				return await fetchKeywordDifficulty(
					this.http,
					this.parseParams(keywordDifficultyDescriptor, params) as KeywordDifficultyParams,
					ctx,
				);
			case keywordsForSiteDescriptor.id:
				return await fetchKeywordsForSite(
					this.http,
					this.parseParams(keywordsForSiteDescriptor, params) as KeywordsForSiteParams,
					ctx,
				);
			case relatedKeywordsDescriptor.id:
				return await fetchRelatedKeywords(
					this.http,
					this.parseParams(relatedKeywordsDescriptor, params) as RelatedKeywordsParams,
					ctx,
				);
			case competitorsDomainDescriptor.id:
				return await fetchCompetitorsDomain(
					this.http,
					this.parseParams(competitorsDomainDescriptor, params) as CompetitorsDomainParams,
					ctx,
				);
			case domainWhoisOverviewDescriptor.id:
				return await fetchDomainWhoisOverview(
					this.http,
					this.parseParams(domainWhoisOverviewDescriptor, params) as DomainWhoisOverviewParams,
					ctx,
				);
			case onPageInstantDescriptor.id:
				return await fetchOnPageInstantPages(
					this.http,
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
