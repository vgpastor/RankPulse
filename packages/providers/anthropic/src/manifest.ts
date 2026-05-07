import type {
	AclContext,
	AuthStrategy,
	EndpointManifest,
	FetchContext,
	IngestBinding,
	ProviderManifest,
} from '@rankpulse/provider-core';
import { ProviderApiError } from '@rankpulse/provider-core';
import { normaliseAnthropicResponse } from './acl/messages-to-llm-answer.acl.js';
import { parseCredential } from './credential.js';
import {
	type AnthropicMessagesPayload,
	fetchMessagesWithWebSearch,
	type MessagesWithWebSearchParams,
	messagesWithWebSearchDescriptor,
} from './endpoints/messages-with-web-search.js';
import { type AnthropicHttp, AnthropicHttpClient, buildLegacyShim } from './http.js';

/**
 * Anthropic Messages API manifest.
 *
 * - Why `auth.kind = 'api-key-header'` with `headerName: 'x-api-key'`:
 *   Anthropic's auth model is a single API key in the `x-api-key`
 *   header — explicitly NOT `Authorization: Bearer ...`. The default
 *   `BaseHttpClient.applyAuth` for this kind would emit
 *   `{ 'x-api-key': <key> }` and stop there. But Anthropic ALSO
 *   requires the fixed `anthropic-version: 2023-06-01` header on every
 *   request (without it the API rejects with 400 regardless of the key),
 *   so `AnthropicHttpClient` overrides `applyAuth` to emit BOTH headers.
 *   The manifest still declares `'api-key-header'` so the strategy is
 *   self-documenting; the override just extends, doesn't replace, the
 *   contract.
 * - Why no `request<T>` override: the 8MB body cap lives on
 *   `manifest.http.maxResponseBytes` and is enforced by
 *   `BaseHttpClient.parseResponse`. `AnthropicHttpClient` only
 *   overrides `applyAuth` (for the dual `x-api-key` + `anthropic-version`
 *   headers).
 * - Why the ACL wraps the single normalised answer in an array:
 *   `normaliseAnthropicResponse()` returns ONE `NormalisedLlmAnswer`
 *   object — Anthropic's Messages API returns a single assistant
 *   completion per request. The manifest's `IngestBinding.acl`
 *   contract returns `unknown[]`, so we wrap the single result in an
 *   array. The use case ingests one row per execution.
 * - Why `isQuotaExhausted` is overridden: Anthropic returns 429 (rate
 *   limit / monthly cap) and 402 (over-balance / payment required). The
 *   default `isQuotaExhaustedError` (`core/src/error.ts`) does cover
 *   both today, but stating the per-provider semantics explicitly here
 *   makes Anthropic's contract self-documenting and isolates this
 *   provider from any future tightening of the default detector.
 *
 * The ingest binding key matches the worker's existing dispatch
 * (apps/worker/src/processors/provider-fetch.processor.ts:686-697) so
 * when Phase 5 activates the IngestRouter the call routes to the same
 * use case the OLD if-else does.
 *
 * `brandPromptId` lives in the endpoint params (not `ctx.systemParams`)
 * because each prompt is the unit of scheduling — it's stamped per
 * JobDefinition by the AI Brand Radar handler at scheduling time. The
 * `systemParamKey` here mirrors that name so the IngestRouter routes
 * the value through to the use case.
 */
const auth: AuthStrategy = { kind: 'api-key-header', headerName: 'x-api-key' };

/**
 * Adapts the existing `fetchMessagesWithWebSearch(http: AnthropicHttp,
 * ...)` helper to the manifest's `(http: HttpClient, params, ctx) =>
 * Promise<R>` signature.
 *
 * `BaseHttpClient` already owns auth + signal + JSON parse + body cap,
 * but the helper still expects `AnthropicHttp.post`'s 4-arg shape. The
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
		helper: (http: AnthropicHttp, params: TParams, ctx: FetchContext) => Promise<TResponse>,
	): EndpointManifest<unknown, unknown>['fetch'] =>
	async (http, params, ctx) => {
		// IngestRouter constructs ONE `AnthropicHttpClient` per provider at
		// composition time and reuses it across all endpoint fetches; the
		// runtime cast here is safe because the manifest's HTTP config and
		// the registered client are siblings produced from the same factory.
		const shim = buildLegacyShim(http as AnthropicHttpClient, ctx);
		return helper(shim, params as TParams, ctx);
	};

/**
 * Anthropic's Messages API returns ONE assistant completion per request,
 * NOT a multi-row series. `normaliseAnthropicResponse()` reduces that
 * payload to a single `NormalisedLlmAnswer` containing the joined text,
 * citation URLs and token-usage cost. `IngestBinding.acl` returns
 * `unknown[]`, so we wrap the single answer in an array — the use case
 * ingests one row per execution.
 */
const aiAnswerAcl = (response: AnthropicMessagesPayload, _ctx: AclContext): unknown[] => {
	return [normaliseAnthropicResponse(response)];
};

const aiSearchInsightsIngest: IngestBinding<AnthropicMessagesPayload> = {
	useCaseKey: 'ai-search-insights:record-llm-answer',
	systemParamKey: 'brandPromptId',
	acl: aiAnswerAcl,
};

const endpoints: readonly EndpointManifest[] = [
	{
		descriptor: messagesWithWebSearchDescriptor,
		// `fetchMessagesWithWebSearch` accepts the legacy `AnthropicHttp`
		// shape; the adapter wires it through `buildLegacyShim` over the
		// new `AnthropicHttpClient`.
		fetch: adapt<MessagesWithWebSearchParams, AnthropicMessagesPayload>(fetchMessagesWithWebSearch),
		ingest: aiSearchInsightsIngest as IngestBinding,
	},
];

export const anthropicProviderManifest: ProviderManifest = {
	id: 'anthropic',
	displayName: 'Anthropic',
	http: {
		baseUrl: 'https://api.anthropic.com/v1',
		auth,
		defaultTimeoutMs: 60_000,
		// Messages API typically returns a few KB; 8 MB is generous but
		// still tight enough to abort runaway responses before OOM.
		maxResponseBytes: 8 * 1024 * 1024,
	},
	validateCredentialPlaintext(plaintextSecret: string): void {
		// `parseCredential` throws InvalidInputError on the wrong shape
		// (must be ≥20 chars and start with `sk-ant-`). Re-thrown as-is
		// so RegisterProviderCredentialUseCase surfaces a 400 at
		// registration.
		parseCredential(plaintextSecret);
	},
	endpoints,
	// Anthropic returns 429 (rate limit / monthly cap) and 402 (over-balance);
	// auto-pause the JobDefinition until the next billing window.
	isQuotaExhausted(error: unknown): boolean {
		return error instanceof ProviderApiError && (error.status === 402 || error.status === 429);
	},
	buildHttpClient: (http) => new AnthropicHttpClient(http),
};
