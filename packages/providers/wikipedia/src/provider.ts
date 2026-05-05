import { ProviderConnectivity } from '@rankpulse/domain';
import type { EndpointDescriptor, FetchContext, Provider } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import {
	fetchPageviewsPerArticle,
	type PageviewsPerArticleParams,
	pageviewsPerArticleDescriptor,
} from './endpoints/pageviews-per-article.js';
import { fetchTopArticles, type TopArticlesParams, topArticlesDescriptor } from './endpoints/top-articles.js';
import { WikipediaHttp, type WikipediaHttpOptions } from './http.js';

const ENDPOINTS: readonly EndpointDescriptor[] = [pageviewsPerArticleDescriptor, topArticlesDescriptor];

/**
 * Wikimedia REST API provider — entity awareness signal (issue #33).
 *
 * Auth: NONE. The API is public; we only attach a contact `User-Agent`.
 * `validateCredentialPlaintext` accepts any input including the empty
 * string because there's nothing to validate; the
 * RegisterProviderCredentialUseCase still gets called by the operator
 * to track that the source is "enabled" for an org, but the secret can
 * be a sentinel like "public".
 */
export class WikipediaProvider implements Provider {
	readonly id = ProviderConnectivity.ProviderId.create('wikipedia');
	readonly displayName = 'Wikipedia (Wikimedia REST API)';
	readonly authStrategy = 'apiKey' as const;

	private readonly http: WikipediaHttp;

	constructor(options?: WikipediaHttpOptions) {
		this.http = new WikipediaHttp(options);
	}

	discover(): readonly EndpointDescriptor[] {
		return ENDPOINTS;
	}

	validateCredentialPlaintext(_plaintextSecret: string): void {
		// Wikipedia REST API is unauthenticated. We accept any
		// credential (typically the literal "public") so the
		// registration flow stays uniform across providers.
	}

	async fetch(endpointId: string, params: unknown, ctx: FetchContext): Promise<unknown> {
		switch (endpointId) {
			case pageviewsPerArticleDescriptor.id:
				return await fetchPageviewsPerArticle(
					this.http,
					this.parseParams(pageviewsPerArticleDescriptor, params) as PageviewsPerArticleParams,
					ctx,
				);
			case topArticlesDescriptor.id:
				return await fetchTopArticles(
					this.http,
					this.parseParams(topArticlesDescriptor, params) as TopArticlesParams,
					ctx,
				);
			default:
				throw new InvalidInputError(`Wikipedia has no endpoint "${endpointId}"`);
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
