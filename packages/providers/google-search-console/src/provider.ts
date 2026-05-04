import { ProviderConnectivity } from '@rankpulse/domain';
import type { EndpointDescriptor, FetchContext, Provider } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import {
	type SearchAnalyticsParams,
	fetchSearchAnalytics,
	searchAnalyticsDescriptor,
} from './endpoints/search-analytics.js';
import { GscHttp } from './http.js';

const ENDPOINTS: readonly EndpointDescriptor[] = [searchAnalyticsDescriptor];

export class GscProvider implements Provider {
	readonly id = ProviderConnectivity.ProviderId.create('google-search-console');
	readonly displayName = 'Google Search Console';
	readonly authStrategy = 'serviceAccount' as const;

	private readonly http: GscHttp;

	constructor(options?: { fetchImpl?: typeof fetch }) {
		this.http = new GscHttp(options);
	}

	discover(): readonly EndpointDescriptor[] {
		return ENDPOINTS;
	}

	async fetch(endpointId: string, params: unknown, ctx: FetchContext): Promise<unknown> {
		switch (endpointId) {
			case searchAnalyticsDescriptor.id: {
				const parsed = searchAnalyticsDescriptor.paramsSchema.safeParse(params);
				if (!parsed.success) {
					throw new InvalidInputError(`Invalid params for ${endpointId}: ${parsed.error.message}`);
				}
				return await fetchSearchAnalytics(this.http, parsed.data as SearchAnalyticsParams, ctx);
			}
			default:
				throw new InvalidInputError(`google-search-console has no endpoint "${endpointId}"`);
		}
	}
}
