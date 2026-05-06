import type {
	AclContext,
	AuthStrategy,
	EndpointManifest,
	FetchContext,
	IngestBinding,
	ProviderManifest,
} from '@rankpulse/provider-core';
import { ProviderApiError } from '@rankpulse/provider-core';
import { normaliseOpenAiResponse } from './acl/responses-to-llm-answer.acl.js';
import { parseCredential } from './credential.js';
import {
	fetchResponsesWithWebSearch,
	type OpenAiResponsePayload,
	type ResponsesWithWebSearchParams,
	responsesWithWebSearchDescriptor,
} from './endpoints/responses-with-web-search.js';
import { buildLegacyShim, type OpenAiHttp, type OpenAiHttpClient } from './http.js';

/**
 * OpenAI Responses API manifest (sub-issue #61 / parent #27).
 *
 * - Why `auth.kind = 'bearer-token'`: OpenAI's auth model is the
 *   simplest possible — `Authorization: Bearer sk-...`. The default
 *   `BaseHttpClient.applyAuth` for this kind already produces exactly
 *   that header, so the manifest needs zero auth-specific overrides.
 * - Why `OpenAiHttpClient.request` is overridden anyway: see
 *   `./http.ts` header. The override exists ONLY to enforce OpenAI's
 *   8MB response body cap (Content-Length pre-flight + post-read guard).
 *   The auth header itself is re-used from the parent via
 *   `super.applyAuth(...)` — no duplication.
 * - Why the ACL wraps the single normalised answer in an array:
 *   `normaliseOpenAiResponse()` returns ONE `NormalisedLlmAnswer` per
 *   `/v1/responses` payload — the use case ingests one answer per
 *   execution. The manifest's `IngestBinding.acl` contract returns
 *   `unknown[]`, so we wrap the single result in an array; Phase 5's
 *   IngestRouter calls `RecordLlmAnswerUseCase.execute` once per array
 *   element.
 * - Why `isQuotaExhausted` is overridden: OpenAI signals quota
 *   exhaustion via either HTTP 402 (over-balance) or HTTP 429 (rate
 *   limit / monthly cap). The default `isQuotaExhaustedError`
 *   (`core/src/error.ts`) covers both today, but stating the
 *   per-provider semantics explicitly here makes OpenAI's contract
 *   self-documenting and isolates this provider from any future
 *   tightening of the default detector. It also matches the worker's
 *   existing detector at
 *   `apps/worker/src/processors/provider-fetch.processor.ts:149`.
 *
 * The ingest binding key matches the worker's existing dispatch so
 * when Phase 5 activates the IngestRouter the call routes to the same
 * use case the OLD if-else does.
 *
 * `brandPromptId` lives in `ctx.systemParams` because it's stamped by
 * the AI Brand Radar Auto-Schedule handler at scheduling time (ADR
 * 0001), not supplied per-call by the operator.
 */
const auth: AuthStrategy = { kind: 'bearer-token' };

/**
 * Adapts the existing `fetchResponsesWithWebSearch(http: OpenAiHttp, ...)`
 * helper to the manifest's `(http: HttpClient, params, ctx) => Promise<R>`
 * signature.
 *
 * `BaseHttpClient` already owns auth + signal + JSON parse + body cap,
 * but the helper still expects `OpenAiHttp.post`'s 4-arg shape. The
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
		helper: (http: OpenAiHttp, params: TParams, ctx: FetchContext) => Promise<TResponse>,
	): EndpointManifest<unknown, unknown>['fetch'] =>
	async (http, params, ctx) => {
		// IngestRouter constructs ONE `OpenAiHttpClient` per provider at
		// composition time and reuses it across all endpoint fetches; the
		// runtime cast here is safe because the manifest's HTTP config and
		// the registered client are siblings produced from the same factory.
		const shim = buildLegacyShim(http as OpenAiHttpClient, ctx);
		return helper(shim, params as TParams, ctx);
	};

/**
 * `normaliseOpenAiResponse` reduces the raw `/v1/responses` payload to
 * a single `NormalisedLlmAnswer` (text + citations + token usage +
 * cost). The use case takes ONE answer per execution; we wrap to
 * satisfy the manifest's `unknown[]` contract. Phase 5's IngestRouter
 * calls `RecordLlmAnswerUseCase.execute` once per array element.
 */
const aiAnswerAcl = (response: OpenAiResponsePayload, _ctx: AclContext): unknown[] => {
	const normalised = normaliseOpenAiResponse(response);
	return [normalised];
};

const aiSearchInsightsIngest: IngestBinding<OpenAiResponsePayload> = {
	useCaseKey: 'ai-search-insights:record-llm-answer',
	systemParamKey: 'brandPromptId',
	acl: aiAnswerAcl,
};

const endpoints: readonly EndpointManifest[] = [
	{
		descriptor: responsesWithWebSearchDescriptor,
		// `fetchResponsesWithWebSearch` accepts the legacy `OpenAiHttp`
		// shape; the adapter wires it through `buildLegacyShim` over the
		// new `OpenAiHttpClient`.
		fetch: adapt<ResponsesWithWebSearchParams, OpenAiResponsePayload>(fetchResponsesWithWebSearch),
		ingest: aiSearchInsightsIngest as IngestBinding,
	},
];

export const openaiProviderManifest: ProviderManifest = {
	id: 'openai',
	displayName: 'OpenAI',
	http: {
		baseUrl: 'https://api.openai.com/v1',
		auth,
		defaultTimeoutMs: 60_000,
	},
	validateCredentialPlaintext(plaintextSecret: string): void {
		// `parseCredential` throws InvalidInputError when the API key is
		// shorter than 20 chars or doesn't start with `sk-`. Re-thrown
		// as-is so RegisterProviderCredentialUseCase surfaces a 400 at
		// registration.
		parseCredential(plaintextSecret);
	},
	endpoints,
	// OpenAI signals quota exhaustion via either 402 (over-balance) or
	// 429 (rate limit / monthly cap); auto-pause the JobDefinition until
	// the operator tops up.
	isQuotaExhausted(error: unknown): boolean {
		return error instanceof ProviderApiError && (error.status === 402 || error.status === 429);
	},
};
