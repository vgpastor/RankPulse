import { ProviderConnectivity } from '@rankpulse/domain';
import type { EndpointDescriptor, FetchContext, Provider } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import { parseCredential } from './credential.js';
import { fetchSonarSearch, type SonarSearchParams, sonarSearchDescriptor } from './endpoints/sonar-search.js';
import { PerplexityHttp, type PerplexityHttpOptions } from './http.js';

const ENDPOINTS: readonly EndpointDescriptor[] = [sonarSearchDescriptor];

/**
 * Perplexity Sonar provider — third of four for AI Brand Radar (sub-issue
 * #62 of #27). Sonar is grounded by default (no tool plumbing required),
 * making this the cheapest of the four LLM-search providers to keep daily.
 */
export class PerplexityProvider implements Provider {
	readonly id = ProviderConnectivity.ProviderId.create('perplexity');
	readonly displayName = 'Perplexity';
	readonly authStrategy = 'apiKey' as const;

	private readonly http: PerplexityHttp;

	constructor(options?: PerplexityHttpOptions) {
		this.http = new PerplexityHttp(options);
	}

	discover(): readonly EndpointDescriptor[] {
		return ENDPOINTS;
	}

	validateCredentialPlaintext(plaintextSecret: string): void {
		parseCredential(plaintextSecret);
	}

	async fetch(endpointId: string, params: unknown, ctx: FetchContext): Promise<unknown> {
		switch (endpointId) {
			case sonarSearchDescriptor.id:
				return await fetchSonarSearch(
					this.http,
					this.parseParams(sonarSearchDescriptor, params) as SonarSearchParams,
					ctx,
				);
			default:
				throw new InvalidInputError(`Perplexity has no endpoint "${endpointId}"`);
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
