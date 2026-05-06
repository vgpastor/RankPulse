import { ProviderConnectivity } from '@rankpulse/domain';
import type { EndpointDescriptor, FetchContext, Provider } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import { parseCredential } from './credential.js';
import {
	fetchGeminiGrounded,
	type GeminiGroundedParams,
	geminiGroundedDescriptor,
} from './endpoints/gemini-grounded.js';
import { GoogleAiStudioHttp, type GoogleAiStudioHttpOptions } from './http.js';

const ENDPOINTS: readonly EndpointDescriptor[] = [geminiGroundedDescriptor];

/**
 * Google AI Studio provider — fourth and last of the AI Brand Radar
 * fan-out (sub-issue #62 of #27). Uses Gemini's built-in `googleSearch`
 * tool which is grounded against Google's web index — same source as the
 * SERP fan-out, useful for cross-checking what Google's own LLM surfaces
 * vs. what shows up organically.
 */
export class GoogleAiStudioProvider implements Provider {
	readonly id = ProviderConnectivity.ProviderId.create('google-ai-studio');
	readonly displayName = 'Google AI Studio (Gemini)';
	readonly authStrategy = 'apiKey' as const;

	private readonly http: GoogleAiStudioHttp;

	constructor(options?: GoogleAiStudioHttpOptions) {
		this.http = new GoogleAiStudioHttp(options);
	}

	discover(): readonly EndpointDescriptor[] {
		return ENDPOINTS;
	}

	validateCredentialPlaintext(plaintextSecret: string): void {
		parseCredential(plaintextSecret);
	}

	async fetch(endpointId: string, params: unknown, ctx: FetchContext): Promise<unknown> {
		switch (endpointId) {
			case geminiGroundedDescriptor.id:
				return await fetchGeminiGrounded(
					this.http,
					this.parseParams(geminiGroundedDescriptor, params) as GeminiGroundedParams,
					ctx,
				);
			default:
				throw new InvalidInputError(`Google AI Studio has no endpoint "${endpointId}"`);
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
