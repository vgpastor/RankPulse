import { ProviderConnectivity } from '@rankpulse/domain';
import type { EndpointDescriptor, FetchContext, Provider } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import { parseCredential } from './credential.js';
import {
	fetchResponsesWithWebSearch,
	type ResponsesWithWebSearchParams,
	responsesWithWebSearchDescriptor,
} from './endpoints/responses-with-web-search.js';
import { OpenAiHttp, type OpenAiHttpOptions } from './http.js';

const ENDPOINTS: readonly EndpointDescriptor[] = [responsesWithWebSearchDescriptor];

/**
 * OpenAI Responses API provider — first half of the AI Brand Radar
 * (sub-issue #61 / parent #27). Single endpoint
 * `openai-responses-with-web-search` that captures grounded answers + URL
 * citations for downstream mention extraction. The other 3 LLM providers
 * (Anthropic, Perplexity, Gemini) follow the same shape and are scheduled
 * for sub-issue #62.
 */
export class OpenAiProvider implements Provider {
	readonly id = ProviderConnectivity.ProviderId.create('openai');
	readonly displayName = 'OpenAI';
	readonly authStrategy = 'apiKey' as const;

	private readonly http: OpenAiHttp;

	constructor(options?: OpenAiHttpOptions) {
		this.http = new OpenAiHttp(options);
	}

	discover(): readonly EndpointDescriptor[] {
		return ENDPOINTS;
	}

	validateCredentialPlaintext(plaintextSecret: string): void {
		parseCredential(plaintextSecret);
	}

	async fetch(endpointId: string, params: unknown, ctx: FetchContext): Promise<unknown> {
		switch (endpointId) {
			case responsesWithWebSearchDescriptor.id:
				return await fetchResponsesWithWebSearch(
					this.http,
					this.parseParams(responsesWithWebSearchDescriptor, params) as ResponsesWithWebSearchParams,
					ctx,
				);
			default:
				throw new InvalidInputError(`OpenAI has no endpoint "${endpointId}"`);
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
