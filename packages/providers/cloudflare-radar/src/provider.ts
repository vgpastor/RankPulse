import { ProviderConnectivity } from '@rankpulse/domain';
import type { EndpointDescriptor, FetchContext, Provider } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import { validateCloudflareToken } from './credential.js';
import { type DomainRankParams, domainRankDescriptor, fetchDomainRank } from './endpoints/domain-rank.js';
import { CloudflareRadarHttp } from './http.js';

const ENDPOINTS: readonly EndpointDescriptor[] = [domainRankDescriptor];

export class CloudflareRadarProvider implements Provider {
	readonly id = ProviderConnectivity.ProviderId.create('cloudflare-radar');
	readonly displayName = 'Cloudflare Radar';
	readonly authStrategy = 'apiKey' as const;

	private readonly http: CloudflareRadarHttp;

	constructor(options?: { fetchImpl?: typeof fetch }) {
		this.http = new CloudflareRadarHttp(options);
	}

	discover(): readonly EndpointDescriptor[] {
		return ENDPOINTS;
	}

	validateCredentialPlaintext(plaintextSecret: string): void {
		validateCloudflareToken(plaintextSecret);
	}

	async fetch(endpointId: string, params: unknown, ctx: FetchContext): Promise<unknown> {
		switch (endpointId) {
			case domainRankDescriptor.id: {
				const parsed = domainRankDescriptor.paramsSchema.safeParse(params);
				if (!parsed.success) {
					throw new InvalidInputError(`Invalid params for ${endpointId}: ${parsed.error.message}`);
				}
				return await fetchDomainRank(this.http, parsed.data as DomainRankParams, ctx);
			}
			default:
				throw new InvalidInputError(`cloudflare-radar has no endpoint "${endpointId}"`);
		}
	}
}
