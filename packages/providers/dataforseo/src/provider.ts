import { ProviderConnectivity } from '@rankpulse/domain';
import type { EndpointDescriptor, FetchContext, Provider } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import { parseCredential } from './credential.js';
import {
	fetchSerpGoogleOrganicLive,
	type SerpGoogleOrganicLiveParams,
	serpGoogleOrganicLiveDescriptor,
} from './endpoints/serp-google-organic-live.js';
import { DataForSeoHttp, type DataForSeoHttpOptions } from './http.js';

const ENDPOINTS: readonly EndpointDescriptor[] = [serpGoogleOrganicLiveDescriptor];

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
		switch (endpointId) {
			case serpGoogleOrganicLiveDescriptor.id: {
				const parsed = serpGoogleOrganicLiveDescriptor.paramsSchema.safeParse(params);
				if (!parsed.success) {
					throw new InvalidInputError(`Invalid params for ${endpointId}: ${parsed.error.message}`);
				}
				return await fetchSerpGoogleOrganicLive(this.http, parsed.data as SerpGoogleOrganicLiveParams, ctx);
			}
			default:
				throw new InvalidInputError(`DataForSEO has no endpoint "${endpointId}"`);
		}
	}
}
