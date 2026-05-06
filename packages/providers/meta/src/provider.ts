import { ProviderConnectivity } from '@rankpulse/domain';
import type { EndpointDescriptor, FetchContext, Provider } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import { validateMetaAccessToken } from './credential.js';
import { type AdsInsightsParams, adsInsightsDescriptor, fetchAdsInsights } from './endpoints/ads-insights.js';
import {
	type CustomAudiencesParams,
	customAudiencesDescriptor,
	fetchCustomAudiences,
} from './endpoints/custom-audiences.js';
import {
	fetchPixelEventsStats,
	type PixelEventsStatsParams,
	pixelEventsStatsDescriptor,
} from './endpoints/pixel-events-stats.js';
import { MetaHttp } from './http.js';

const ENDPOINTS: readonly EndpointDescriptor[] = [
	pixelEventsStatsDescriptor,
	adsInsightsDescriptor,
	customAudiencesDescriptor,
];

export class MetaProvider implements Provider {
	readonly id = ProviderConnectivity.ProviderId.create('meta');
	readonly displayName = 'Meta (Facebook + Instagram)';
	readonly authStrategy = 'apiKey' as const;

	private readonly http: MetaHttp;

	constructor(options?: { fetchImpl?: typeof fetch }) {
		this.http = new MetaHttp(options);
	}

	discover(): readonly EndpointDescriptor[] {
		return ENDPOINTS;
	}

	validateCredentialPlaintext(plaintextSecret: string): void {
		validateMetaAccessToken(plaintextSecret);
	}

	async fetch(endpointId: string, params: unknown, ctx: FetchContext): Promise<unknown> {
		switch (endpointId) {
			case pixelEventsStatsDescriptor.id: {
				const parsed = pixelEventsStatsDescriptor.paramsSchema.safeParse(params);
				if (!parsed.success) {
					throw new InvalidInputError(`Invalid params for ${endpointId}: ${parsed.error.message}`);
				}
				return await fetchPixelEventsStats(this.http, parsed.data as PixelEventsStatsParams, ctx);
			}
			case adsInsightsDescriptor.id: {
				const parsed = adsInsightsDescriptor.paramsSchema.safeParse(params);
				if (!parsed.success) {
					throw new InvalidInputError(`Invalid params for ${endpointId}: ${parsed.error.message}`);
				}
				return await fetchAdsInsights(this.http, parsed.data as AdsInsightsParams, ctx);
			}
			case customAudiencesDescriptor.id: {
				const parsed = customAudiencesDescriptor.paramsSchema.safeParse(params);
				if (!parsed.success) {
					throw new InvalidInputError(`Invalid params for ${endpointId}: ${parsed.error.message}`);
				}
				return await fetchCustomAudiences(this.http, parsed.data as CustomAudiencesParams, ctx);
			}
			default:
				throw new InvalidInputError(`meta has no endpoint "${endpointId}"`);
		}
	}
}
