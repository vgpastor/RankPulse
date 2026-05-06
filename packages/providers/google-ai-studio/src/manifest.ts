import type {
	AclContext,
	AuthStrategy,
	EndpointManifest,
	FetchContext,
	IngestBinding,
	ProviderManifest,
} from '@rankpulse/provider-core';
import { ProviderApiError } from '@rankpulse/provider-core';
import { normaliseGeminiResponse } from './acl/gemini-to-llm-answer.acl.js';
import { parseCredential } from './credential.js';
import {
	fetchGeminiGrounded,
	type GeminiGroundedParams,
	type GeminiPayload,
	geminiGroundedDescriptor,
} from './endpoints/gemini-grounded.js';
import { buildLegacyShim, type GoogleAiStudioHttp, GoogleAiStudioHttpClient } from './http.js';

/**
 * Google AI Studio (`generativelanguage.googleapis.com`) manifest
 * (sub-issue #62 / parent #27).
 *
 * - Why `auth.kind = 'api-key-header'` with `headerName: 'x-goog-api-key'`:
 *   Google AI Studio's preferred auth is the `x-goog-api-key` request
 *   header (the `?key=` query-param form leaks into proxy logs). The
 *   default `BaseHttpClient.applyAuth` for `'api-key-header'` produces
 *   exactly `{ [headerName]: plaintextSecret }`, so we re-use it.
 * - Why `GoogleAiStudioHttpClient.request` is overridden anyway: see
 *   `./http.ts`. The override exists ONLY to enforce the 8MB response
 *   body cap. The auth header itself is re-used from the parent via
 *   `super.applyAuth(...)` — no duplication.
 * - Why the ACL wraps the single normalised answer in an array:
 *   `normaliseGeminiResponse()` returns ONE `NormalisedLlmAnswer` per
 *   `generateContent` payload — the use case ingests one answer per
 *   execution. The manifest's `IngestBinding.acl` contract returns
 *   `unknown[]`, so we wrap; Phase 5's IngestRouter calls the use case
 *   once per array element.
 * - Why `isQuotaExhausted` is overridden: Google AI Studio signals quota
 *   exhaustion via either HTTP 402 (over-balance) or HTTP 429 (rate
 *   limit / monthly cap). Stating the per-provider semantics here
 *   isolates this provider from any future tightening of the default
 *   detector.
 *
 * The ingest binding key matches the worker's existing dispatch so when
 * Phase 5 activates the IngestRouter the call routes to the same use
 * case the OLD if-else does. `brandPromptId` lives in `ctx.systemParams`
 * because it's stamped by the AI Brand Radar Auto-Schedule handler at
 * scheduling time (ADR 0001), not supplied per-call.
 */
const auth: AuthStrategy = { kind: 'api-key-header', headerName: 'x-goog-api-key' };

const adapt =
	<TParams, TResponse>(
		helper: (http: GoogleAiStudioHttp, params: TParams, ctx: FetchContext) => Promise<TResponse>,
	): EndpointManifest<unknown, unknown>['fetch'] =>
	async (http, params, ctx) => {
		const shim = buildLegacyShim(http as GoogleAiStudioHttpClient, ctx);
		return helper(shim, params as TParams, ctx);
	};

const aiAnswerAcl = (response: GeminiPayload, _ctx: AclContext): unknown[] => {
	const normalised = normaliseGeminiResponse(response);
	return [normalised];
};

const aiSearchInsightsIngest: IngestBinding<GeminiPayload> = {
	useCaseKey: 'ai-search-insights:record-llm-answer',
	systemParamKey: 'brandPromptId',
	acl: aiAnswerAcl,
};

const endpoints: readonly EndpointManifest[] = [
	{
		descriptor: geminiGroundedDescriptor,
		fetch: adapt<GeminiGroundedParams, GeminiPayload>(fetchGeminiGrounded),
		ingest: aiSearchInsightsIngest as IngestBinding,
	},
];

export const googleAiStudioProviderManifest: ProviderManifest = {
	id: 'google-ai-studio',
	displayName: 'Google AI Studio',
	http: {
		baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
		auth,
		defaultTimeoutMs: 60_000,
	},
	validateCredentialPlaintext(plaintextSecret: string): void {
		// `parseCredential` throws InvalidInputError on a malformed key;
		// re-thrown as-is so RegisterProviderCredentialUseCase surfaces
		// a 400 at registration.
		parseCredential(plaintextSecret);
	},
	endpoints,
	isQuotaExhausted(error: unknown): boolean {
		return error instanceof ProviderApiError && (error.status === 402 || error.status === 429);
	},
	buildHttpClient: (http) => new GoogleAiStudioHttpClient(http),
};
