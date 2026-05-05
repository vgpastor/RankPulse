import { ProviderConnectivity } from '@rankpulse/domain';
import type { EndpointDescriptor, FetchContext, Provider } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import {
	fetchRunPagespeed,
	type RunPagespeedParams,
	runPagespeedDescriptor,
} from './endpoints/runpagespeed.js';
import { PageSpeedHttp, type PageSpeedHttpOptions } from './http.js';

const ENDPOINTS: readonly EndpointDescriptor[] = [runPagespeedDescriptor];

const API_KEY_REGEX = /^[A-Za-z0-9_-]{20,}$/;

/**
 * Google PageSpeed Insights provider — v1.1 free expansion (issue #18).
 *
 * Auth: a single API key from Google Cloud Console (PSI v5). The
 * plaintext credential is just the key string; we validate the
 * minimum shape (alphanumeric + `_` / `-`, length >= 20) so a typo at
 * registration time fails fast instead of becoming a runtime 403 in
 * the worker.
 */
export class PageSpeedProvider implements Provider {
	readonly id = ProviderConnectivity.ProviderId.create('pagespeed');
	readonly displayName = 'Google PageSpeed Insights';
	readonly authStrategy = 'apiKey' as const;

	private readonly http: PageSpeedHttp;

	constructor(options?: PageSpeedHttpOptions) {
		this.http = new PageSpeedHttp(options);
	}

	discover(): readonly EndpointDescriptor[] {
		return ENDPOINTS;
	}

	validateCredentialPlaintext(plaintextSecret: string): void {
		if (!API_KEY_REGEX.test(plaintextSecret)) {
			throw new InvalidInputError(
				'PageSpeed Insights API key must be at least 20 characters of [A-Za-z0-9_-]',
			);
		}
	}

	async fetch(endpointId: string, params: unknown, ctx: FetchContext): Promise<unknown> {
		switch (endpointId) {
			case runPagespeedDescriptor.id:
				return await fetchRunPagespeed(
					this.http,
					this.parseParams(runPagespeedDescriptor, params) as RunPagespeedParams,
					ctx.credential.plaintextSecret,
					ctx,
				);
			default:
				throw new InvalidInputError(`PageSpeed has no endpoint "${endpointId}"`);
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
