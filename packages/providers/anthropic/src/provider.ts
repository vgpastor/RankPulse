import { ProviderConnectivity } from '@rankpulse/domain';
import type { EndpointDescriptor, FetchContext, Provider } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import { parseCredential } from './credential.js';
import {
	fetchMessagesWithWebSearch,
	type MessagesWithWebSearchParams,
	messagesWithWebSearchDescriptor,
} from './endpoints/messages-with-web-search.js';
import { AnthropicHttp, type AnthropicHttpOptions } from './http.js';

const ENDPOINTS: readonly EndpointDescriptor[] = [messagesWithWebSearchDescriptor];

/**
 * Anthropic Messages API provider — second of four for AI Brand Radar
 * (sub-issue #62 of #27). Mirror of the OpenAI provider; the worker selects
 * one or the other based on `definition.providerId`.
 */
export class AnthropicProvider implements Provider {
	readonly id = ProviderConnectivity.ProviderId.create('anthropic');
	readonly displayName = 'Anthropic';
	readonly authStrategy = 'apiKey' as const;

	private readonly http: AnthropicHttp;

	constructor(options?: AnthropicHttpOptions) {
		this.http = new AnthropicHttp(options);
	}

	discover(): readonly EndpointDescriptor[] {
		return ENDPOINTS;
	}

	validateCredentialPlaintext(plaintextSecret: string): void {
		parseCredential(plaintextSecret);
	}

	async fetch(endpointId: string, params: unknown, ctx: FetchContext): Promise<unknown> {
		switch (endpointId) {
			case messagesWithWebSearchDescriptor.id:
				return await fetchMessagesWithWebSearch(
					this.http,
					this.parseParams(messagesWithWebSearchDescriptor, params) as MessagesWithWebSearchParams,
					ctx,
				);
			default:
				throw new InvalidInputError(`Anthropic has no endpoint "${endpointId}"`);
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
