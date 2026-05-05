import { ProviderConnectivity } from '@rankpulse/domain';
import type { EndpointDescriptor, FetchContext, Provider } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import { validateBingApiKey } from './credential.js';
import { fetchQueryStats, type QueryStatsParams, queryStatsDescriptor } from './endpoints/query-stats.js';
import {
	fetchRankAndTrafficStats,
	type RankAndTrafficStatsParams,
	rankAndTrafficStatsDescriptor,
} from './endpoints/rank-and-traffic-stats.js';
import { BingHttp } from './http.js';

const ENDPOINTS: readonly EndpointDescriptor[] = [rankAndTrafficStatsDescriptor, queryStatsDescriptor];

export class BingProvider implements Provider {
	readonly id = ProviderConnectivity.ProviderId.create('bing-webmaster');
	readonly displayName = 'Bing Webmaster Tools';
	readonly authStrategy = 'apiKey' as const;

	private readonly http: BingHttp;

	constructor(options?: { fetchImpl?: typeof fetch }) {
		this.http = new BingHttp(options);
	}

	discover(): readonly EndpointDescriptor[] {
		return ENDPOINTS;
	}

	validateCredentialPlaintext(plaintextSecret: string): void {
		validateBingApiKey(plaintextSecret);
	}

	async fetch(endpointId: string, params: unknown, ctx: FetchContext): Promise<unknown> {
		switch (endpointId) {
			case rankAndTrafficStatsDescriptor.id: {
				const parsed = rankAndTrafficStatsDescriptor.paramsSchema.safeParse(params);
				if (!parsed.success) {
					throw new InvalidInputError(`Invalid params for ${endpointId}: ${parsed.error.message}`);
				}
				return await fetchRankAndTrafficStats(this.http, parsed.data as RankAndTrafficStatsParams, ctx);
			}
			case queryStatsDescriptor.id: {
				const parsed = queryStatsDescriptor.paramsSchema.safeParse(params);
				if (!parsed.success) {
					throw new InvalidInputError(`Invalid params for ${endpointId}: ${parsed.error.message}`);
				}
				return await fetchQueryStats(this.http, parsed.data as QueryStatsParams, ctx);
			}
			default:
				throw new InvalidInputError(`bing-webmaster has no endpoint "${endpointId}"`);
		}
	}
}
