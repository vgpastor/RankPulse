import type {
	AuthStrategy,
	EndpointManifest,
	FetchContext,
	ProviderManifest,
} from '@rankpulse/provider-core';
import { validateBrevoApiKey } from './credential.js';
import {
	type CampaignStatisticsParams,
	type CampaignStatisticsResponse,
	campaignStatisticsDescriptor,
	fetchCampaignStatistics,
} from './endpoints/campaign-statistics.js';
import {
	type ContactAttributesParams,
	type ContactAttributesResponse,
	contactAttributesDescriptor,
	fetchContactAttributes,
} from './endpoints/contact-attributes.js';
import {
	type ConversationStatsParams,
	type ConversationStatsResponse,
	conversationStatsDescriptor,
	fetchConversationStats,
} from './endpoints/conversation-stats.js';
import {
	type EmailStatisticsParams,
	type EmailStatisticsResponse,
	emailStatisticsDescriptor,
	fetchEmailStatistics,
} from './endpoints/email-statistics.js';
import { type BrevoHttp, BrevoHttpClient, buildLegacyShim } from './http.js';

/**
 * Brevo (Sendinblue) provider manifest.
 *
 * - Why `auth.kind = 'api-key-header'` with `headerName: 'api-key'`:
 *   Brevo's auth model is a single API key applied as the literal header
 *   `api-key: <plaintext>` (NOT `Authorization: Bearer ...`, NOT
 *   `X-API-Key`). The default `BaseHttpClient.applyAuth` for this kind
 *   already returns `{ [headerName]: plaintextSecret }`, so the manifest
 *   needs zero auth-specific overrides.
 * - Why no `BrevoHttpClient.request` override: Brevo's 8MB response
 *   body cap moved to `manifest.http.maxResponseBytes` and is enforced
 *   by `BaseHttpClient.parseResponse` (Content-Length pre-flight +
 *   post-read guard). No subclass override is needed for the body cap.
 * - Why ALL FOUR endpoints have `ingest: null`: Brevo's payloads are
 *   raw-only ingest today — no worker dispatch is wired (verified by
 *   `grep -n 'brevo' apps/worker/src/processors/provider-fetch.processor.ts`
 *   returning nothing). Three ACLs live in `acl/` (campaign-stats,
 *   email-stats, conversations-to-daily) ready to be plugged in when
 *   Phase 5 wires the corresponding ingest use cases (e.g. an
 *   `email-engagement:record-daily` use case feeding the
 *   `email_engagement_daily` hypertable, and a `chat-conversations:record-daily`
 *   feeding `chat_conversations_daily`). That binding is a follow-up
 *   commit; until then, the IngestRouter dispatches the raw payload
 *   straight to the dedup table without an ingest hop.
 */
const auth: AuthStrategy = { kind: 'api-key-header', headerName: 'api-key' };

/**
 * Adapts the existing `fetchX(http: BrevoHttp, ...)` helpers to the
 * manifest's `(http: HttpClient, params, ctx) => Promise<R>` signature.
 *
 * `BaseHttpClient` already owns auth + signal + JSON parse + body cap,
 * but the helpers still expect `BrevoHttp.get`'s 4-arg shape. The shim
 * preserves that signature until Phase 5 inlines the helpers into the
 * manifest fetch closures.
 *
 * `params` arrives typed as `unknown` from the IngestRouter (which only
 * trusts what zod validated upstream). The cast is safe because the
 * worker validates `definition.params` against `descriptor.paramsSchema`
 * BEFORE invoking `fetch`. A malformed payload would have failed before
 * reaching here.
 */
const adapt =
	<TParams, TResponse>(
		helper: (http: BrevoHttp, params: TParams, ctx: FetchContext) => Promise<TResponse>,
	): EndpointManifest<unknown, unknown>['fetch'] =>
	async (http, params, ctx) => {
		// IngestRouter constructs ONE `BrevoHttpClient` per provider at
		// composition time and reuses it across all endpoint fetches; the
		// runtime cast here is safe because the manifest's HTTP config and
		// the registered client are siblings produced from the same factory.
		const shim = buildLegacyShim(http as BrevoHttpClient, ctx);
		return helper(shim, params as TParams, ctx);
	};

const endpoints: readonly EndpointManifest[] = [
	{
		descriptor: campaignStatisticsDescriptor,
		fetch: adapt<CampaignStatisticsParams, CampaignStatisticsResponse>(fetchCampaignStatistics),
		ingest: null,
	},
	{
		descriptor: contactAttributesDescriptor,
		fetch: adapt<ContactAttributesParams, ContactAttributesResponse>(fetchContactAttributes),
		ingest: null,
	},
	{
		descriptor: conversationStatsDescriptor,
		fetch: adapt<ConversationStatsParams, ConversationStatsResponse>(fetchConversationStats),
		ingest: null,
	},
	{
		descriptor: emailStatisticsDescriptor,
		fetch: adapt<EmailStatisticsParams, EmailStatisticsResponse>(fetchEmailStatistics),
		ingest: null,
	},
];

export const brevoProviderManifest: ProviderManifest = {
	id: 'brevo',
	displayName: 'Brevo',
	http: {
		baseUrl: 'https://api.brevo.com/v3',
		auth,
		defaultTimeoutMs: 60_000,
		// Brevo email-stats responses are typically <1MB; 8MB is a generous
		// safety net for `/contacts/{id}` payloads with long event histories.
		// Enforced by `BaseHttpClient.parseResponse`.
		maxResponseBytes: 8 * 1024 * 1024,
	},
	validateCredentialPlaintext(plaintextSecret: string): void {
		// `validateBrevoApiKey` throws InvalidInputError on the wrong shape
		// (must be `xkeysib-<64-hex>-<16-alphanumeric>` v3 format). Re-thrown
		// as-is so RegisterProviderCredentialUseCase surfaces a 400 at
		// registration. Legacy v2 keys (no prefix) are deliberately rejected
		// to keep `last_four` unique enough to disambiguate keys in the UI.
		validateBrevoApiKey(plaintextSecret);
	},
	endpoints,
	buildHttpClient: (http) => new BrevoHttpClient(http),
};
