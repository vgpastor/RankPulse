import type {
	AclContext,
	AuthStrategy,
	EndpointManifest,
	FetchContext,
	IngestBinding,
	ProviderManifest,
} from '@rankpulse/provider-core';
import { ProviderApiError } from '@rankpulse/provider-core';
import { normalisePerplexityResponse } from './acl/sonar-to-llm-answer.acl.js';
import { parseCredential } from './credential.js';
import {
	type PerplexityChatPayload,
	type SonarSearchParams,
	fetchSonarSearch,
	sonarSearchDescriptor,
} from './endpoints/sonar-search.js';
import { buildLegacyShim, type PerplexityHttp, type PerplexityHttpClient } from './http.js';

/**
 * Perplexity Sonar manifest.
 *
 * - Why `auth.kind = 'bearer-token'`: Perplexity exposes an
 *   OpenAI-compatible REST surface — the auth model is the simplest
 *   possible, `Authorization: Bearer <pplx-…>`. The default
 *   `BaseHttpClient.applyAuth` for this kind already produces exactly
 *   that header, so the manifest needs zero auth-specific overrides.
 * - Why `PerplexityHttpClient.request` is overridden anyway: see
 *   `./http.ts` header. The override exists ONLY to enforce Perplexity's
 *   8MB response body cap (Content-Length pre-flight + post-read guard).
 *   The auth header itself is re-used from the parent via
 *   `super.applyAuth(...)` — no duplication.
 * - Why the ACL wraps the single LLM answer in an array:
 *   `normalisePerplexityResponse()` returns ONE
 *   `NormalisedLlmAnswer` per Sonar call (a single chat completion),
 *   and the manifest's `IngestBinding.acl` contract returns `unknown[]`,
 *   so we wrap the single result in an array. The
 *   `ai-search-insights:record-llm-answer` use case ingests one row per
 *   execution.
 *
 * The ingest binding key matches the worker's existing dispatch
 * (apps/worker/src/processors/provider-fetch.processor.ts:699-710) so
 * when Phase 5 activates the IngestRouter the call routes to the same
 * use case the OLD if-else does.
 *
 * `brandPromptId` lives in `ctx.systemParams` because it's stamped by
 * the LinkBrandPrompt Auto-Schedule handler at scheduling time
 * (ADR 0001), not supplied per-call by the operator.
 *
 * No `isQuotaExhausted` override — Perplexity uses the standard 429
 * (rate-limit / monthly cap) signal and the default detector in
 * `core/src/error.ts` already covers it. The worker also handles 402,
 * but in practice Perplexity surfaces over-balance scenarios as 429 too;
 * keeping the default detector keeps the per-provider surface minimal.
 */
const auth: AuthStrategy = { kind: 'bearer-token' };

/**
 * Adapts the existing `fetchSonarSearch(http: PerplexityHttp, ...)` helper
 * to the manifest's `(http: HttpClient, params, ctx) => Promise<R>`
 * signature.
 *
 * `BaseHttpClient` already owns auth + signal + JSON parse + body cap,
 * but the helper still expects `PerplexityHttp.post`'s 4-arg shape. The
 * shim preserves that signature until Phase 5 inlines the helper into
 * the manifest fetch closure.
 *
 * `params` arrives typed as `unknown` from the IngestRouter (which only
 * trusts what zod validated upstream). The cast is safe because the
 * worker validates `definition.params` against `descriptor.paramsSchema`
 * BEFORE invoking `fetch`. A malformed payload would have failed before
 * reaching here.
 */
const adapt =
	<TParams, TResponse>(
		helper: (http: PerplexityHttp, params: TParams, ctx: FetchContext) => Promise<TResponse>,
	): EndpointManifest<unknown, unknown>['fetch'] =>
	async (http, params, ctx) => {
		// IngestRouter constructs ONE `PerplexityHttpClient` per provider at
		// composition time and reuses it across all endpoint fetches; the
		// runtime cast here is safe because the manifest's HTTP config and
		// the registered client are siblings produced from the same factory.
		const shim = buildLegacyShim(http as PerplexityHttpClient, ctx);
		return helper(shim, params as TParams, ctx);
	};

/**
 * Perplexity returns ONE chat completion per call —
 * `normalisePerplexityResponse()` reduces the upstream payload to a
 * single `NormalisedLlmAnswer`. `IngestBinding.acl` returns `unknown[]`,
 * so we wrap the single answer in an array — the use case ingests one
 * row per execution.
 */
const aiAnswerAcl = (response: PerplexityChatPayload, _ctx: AclContext): unknown[] => {
	return [normalisePerplexityResponse(response)];
};

const aiSearchInsightsIngest: IngestBinding<PerplexityChatPayload> = {
	useCaseKey: 'ai-search-insights:record-llm-answer',
	systemParamKey: 'brandPromptId',
	acl: aiAnswerAcl,
};

const endpoints: readonly EndpointManifest[] = [
	{
		descriptor: sonarSearchDescriptor,
		// `fetchSonarSearch` accepts the legacy `PerplexityHttp` shape; the
		// adapter wires it through `buildLegacyShim` over the new
		// `PerplexityHttpClient`.
		fetch: adapt<SonarSearchParams, PerplexityChatPayload>(fetchSonarSearch),
		ingest: aiSearchInsightsIngest as IngestBinding,
	},
];

export const perplexityProviderManifest: ProviderManifest = {
	id: 'perplexity',
	displayName: 'Perplexity',
	http: {
		baseUrl: 'https://api.perplexity.ai',
		auth,
		defaultTimeoutMs: 60_000,
	},
	validateCredentialPlaintext(plaintextSecret: string): void {
		// `parseCredential` throws InvalidInputError on the wrong shape
		// (must start with `pplx-` and be at least 20 chars). Re-thrown
		// as-is so RegisterProviderCredentialUseCase surfaces a 400 at
		// registration.
		parseCredential(plaintextSecret);
	},
	endpoints,
	// Perplexity surfaces quota exhaustion as 429 (rate-limit / monthly
	// cap) and 402 (over-balance / hard-stopped account); auto-pause the
	// JobDefinition until the operator tops up.
	isQuotaExhausted(error: unknown): boolean {
		return error instanceof ProviderApiError && (error.status === 402 || error.status === 429);
	},
};
