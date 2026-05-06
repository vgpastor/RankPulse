import type {
	AuthStrategy,
	EndpointManifest,
	HttpRequest,
	IngestBinding,
	ProviderManifest,
} from '@rankpulse/provider-core';
import { extractPageviews } from './acl/pageviews-to-observations.acl.js';
import {
	fetchPageviewsPerArticle,
	type PageviewsPerArticleResponse,
	pageviewsPerArticleDescriptor,
} from './endpoints/pageviews-per-article.js';
import { fetchTopArticles, topArticlesDescriptor } from './endpoints/top-articles.js';
import { buildLegacyShim, type WikipediaHttp, type WikipediaHttpClient } from './http.js';

/**
 * Wikimedia REST API manifest.
 *
 * - Why `auth.kind = 'custom'` with a no-op `sign`: Wikipedia is unauthenticated
 *   (only requirement is a contact `User-Agent` header per
 *   https://wikitech.wikimedia.org/wiki/Robot_policy). The manifest schema
 *   requires every provider to declare an `AuthStrategy`, and none of the
 *   built-in kinds (`bearer-token`, `api-key-header`, `basic`, ...) match
 *   "no auth at all". `'custom'` with a pass-through `sign` is the cleanest
 *   way to express "the manifest needs an auth shape but there is nothing
 *   to apply".
 * - Why `WikipediaHttpClient.request` is overridden: see `./http.ts` header.
 *   `BaseHttpClient.applyAuth` throws for `'custom'`; the override skips
 *   auth entirely and applies User-Agent + Accept + Accept-Encoding headers
 *   on every request.
 * - Why the pageviews ACL projects to a stripped row shape: the worker today
 *   maps `extractPageviews()` output to `{ observedAt, views, access, agent,
 *   granularity }` BEFORE calling `ingestWikipediaPageviewsUseCase.execute`
 *   (apps/worker/src/processors/provider-fetch.processor.ts:454-460). The
 *   IngestRouter (Phase 5) consumes whatever this ACL emits, so we replicate
 *   the projection here to keep the migrated path behavior-equivalent.
 *
 * The ingest binding key matches the worker's existing dispatch
 * (apps/worker/src/processors/provider-fetch.processor.ts ~line 437) so
 * when Phase 5 activates the IngestRouter the call routes to the same use
 * case the OLD if-else does.
 *
 * `wikipediaArticleId` lives in `ctx.systemParams` because it's stamped by
 * the LinkWikipediaArticle Auto-Schedule handler at scheduling time
 * (ADR 0001), not supplied per-call by the operator.
 */
export const wikipediaSignRequest = (req: HttpRequest, _plaintextSecret: string): HttpRequest => req;

const auth: AuthStrategy = { kind: 'custom', sign: wikipediaSignRequest };

/**
 * Adapts the existing `fetchPageviewsPerArticle(http: WikipediaHttp, ...)` /
 * `fetchTopArticles(http: WikipediaHttp, ...)` helpers to the manifest's
 * `(http: HttpClient, params, ctx) => Promise<R>` signature.
 *
 * `BaseHttpClient` already owns timeouts and error wrapping, but the helper
 * still expects `WikipediaHttp.get`'s 2-arg shape. The shim preserves that
 * signature until Phase 5 inlines the helper into the manifest fetch
 * closure.
 *
 * `params` arrives typed as `unknown` from the IngestRouter (which only
 * trusts what zod validated upstream). The cast is safe because the worker
 * validates `definition.params` against `descriptor.paramsSchema` BEFORE
 * invoking `fetch`. A malformed payload would have failed before reaching
 * here.
 */
const adapt =
	<TParams, TResponse>(
		helper: (
			http: WikipediaHttp,
			params: TParams,
			ctx: Parameters<typeof buildLegacyShim>[1],
		) => Promise<TResponse>,
	): EndpointManifest<unknown, unknown>['fetch'] =>
	async (http, params, ctx) => {
		// IngestRouter constructs ONE `WikipediaHttpClient` per provider at
		// composition time and reuses it across all endpoint fetches; the
		// runtime cast here is safe because the manifest's HTTP config and
		// the registered client are siblings produced from the same factory.
		const shim = buildLegacyShim(http as WikipediaHttpClient, ctx);
		return helper(shim, params as TParams, ctx);
	};

const pageviewsAcl = (response: PageviewsPerArticleResponse): unknown[] => {
	// The worker dispatch projects extractPageviews() output before ingest
	// (provider-fetch.processor.ts:454-460); the IngestRouter (Phase 5)
	// consumes whatever this ACL emits. Match the worker's projection so
	// the migrated path stays behavior-equivalent — drop `project` and
	// `article` from the row before passing to the use case.
	return extractPageviews(response).map((o) => ({
		observedAt: o.observedAt,
		views: o.views,
		access: o.access,
		agent: o.agent,
		granularity: o.granularity,
	}));
};

const pageviewsIngest: IngestBinding<PageviewsPerArticleResponse> = {
	useCaseKey: 'entity-awareness:ingest-wikipedia-pageviews',
	systemParamKey: 'wikipediaArticleId',
	acl: pageviewsAcl,
};

const endpoints: readonly EndpointManifest[] = [
	{
		descriptor: pageviewsPerArticleDescriptor,
		fetch: adapt(fetchPageviewsPerArticle),
		ingest: pageviewsIngest as IngestBinding,
	},
	{
		descriptor: topArticlesDescriptor,
		fetch: adapt(fetchTopArticles),
		// `wikipedia-top-articles` has no auto-dispatch wired today — the
		// worker only persists the raw payload for trend monitoring. The
		// IngestRouter treats `ingest: null` as raw-only.
		ingest: null,
	},
];

export const wikipediaProviderManifest: ProviderManifest = {
	id: 'wikipedia',
	displayName: 'Wikipedia (Wikimedia REST API)',
	http: {
		baseUrl: 'https://wikimedia.org/api/rest_v1',
		auth,
		defaultTimeoutMs: 60_000,
	},
	validateCredentialPlaintext(_plaintextSecret: string): void {
		// Wikimedia REST is unauthenticated. We accept any sentinel string
		// (typically the literal "public") so the registration flow stays
		// uniform across providers — no format check needed.
	},
	endpoints,
};
