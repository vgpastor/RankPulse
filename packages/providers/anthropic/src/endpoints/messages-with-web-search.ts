import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import { costFromRawPayload } from '../acl/messages-to-llm-answer.acl.js';
import { parseCredential } from '../credential.js';
import type { AnthropicHttp } from '../http.js';

/**
 * `claude-sonnet-4-6` is the user-facing reasoning model for AI Brand Radar
 * captures. Sonnet (not Haiku) because the answer becomes the dashboard's
 * raw text — quality of natural-language framing matters here. The judge
 * (which extracts mentions) still uses Haiku for cost, scoped to its own
 * adapter in `infrastructure/ai-search-insights`.
 */
const DEFAULT_MODEL = 'claude-sonnet-4-6';

/**
 * Anthropic Messages API + `web_search_20250305` tool. Same shape as the
 * OpenAI endpoint so the auto-schedule handler treats every AI provider
 * uniformly: `(prompt, locationCountry, locationLanguage, model, brandPromptId)`.
 */
export const MessagesWithWebSearchParams = z.object({
	prompt: z.string().min(3).max(1000),
	locationCountry: z.string().regex(/^[A-Z]{2}$/),
	locationLanguage: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
	model: z.string().min(2).default(DEFAULT_MODEL),
	brandPromptId: z.string().uuid(),
});
export type MessagesWithWebSearchParams = z.infer<typeof MessagesWithWebSearchParams>;

/**
 * Pricing (validated against Anthropic public pricing as of January 2026):
 *  - Sonnet 4.6: input $3.00/1M, output $15.00/1M.
 *  - web_search tool: $10/1k searches = 1 cent per call. Capped at
 *    `max_uses: 5` per request (worst case 5 cents).
 *
 * Worst-case call: 200 input + 4000 output tokens + 5 searches
 *   ≈ $0.0006 input + $0.06 output + $0.05 search ≈ 11.06 cents.
 * Typical call: 200 input + 800 output tokens + 2 searches ≈ ~3.2 cents.
 *
 * `cost.amount` reserves the 11¢ worst-case in the ledger so budget
 * alerts stay safe; `costFor` reads the actual `usage` block off the
 * response and returns the precise figure post-fetch — that's what
 * api_usage actually charges.
 */
export const MESSAGES_WORST_CASE_COST_CENTS = 11;
const WEB_SEARCH_MAX_USES = 5;

export const messagesWithWebSearchDescriptor: EndpointDescriptor = {
	id: 'anthropic-messages-with-web-search',
	category: 'brand',
	displayName: 'Anthropic — Messages + web_search',
	description:
		'Calls Anthropic /v1/messages with the web_search_20250305 tool enabled, captures the grounded answer + URL citations, and ships the raw text + citations to the AI Brand Radar pipeline.',
	paramsSchema: MessagesWithWebSearchParams,
	cost: { unit: 'usd_cents', amount: MESSAGES_WORST_CASE_COST_CENTS },
	costFor: (_params, response) => costFromRawPayload(response as AnthropicMessagesPayload),
	defaultCron: '0 7 * * *',
	rateLimit: { max: 50, durationMs: 60_000 },
};

export interface AnthropicUsage {
	input_tokens?: number;
	output_tokens?: number;
	cache_creation_input_tokens?: number;
	cache_read_input_tokens?: number;
	server_tool_use?: { web_search_requests?: number };
}

export interface AnthropicCitation {
	type?: string;
	url?: string;
	title?: string;
	cited_text?: string;
}

export interface AnthropicContentBlock {
	type?: string;
	text?: string;
	citations?: AnthropicCitation[];
	name?: string;
	input?: unknown;
}

export interface AnthropicMessagesPayload {
	id?: string;
	model?: string;
	role?: string;
	content?: AnthropicContentBlock[];
	usage?: AnthropicUsage;
}

/**
 * Anthropic's `user_location` accepts `city`, `region`, `country`, and
 * `timezone`. Empirically, country-only configurations have been flaky for
 * some country codes (the request 400s with no clear error from Anthropic),
 * so we attach the country's IANA timezone whenever we know it. Falls back
 * to country-only for codes we haven't mapped yet — strictly additive.
 */
const COUNTRY_TIMEZONE: Record<string, string> = {
	US: 'America/New_York',
	CA: 'America/Toronto',
	MX: 'America/Mexico_City',
	GB: 'Europe/London',
	IE: 'Europe/Dublin',
	FR: 'Europe/Paris',
	DE: 'Europe/Berlin',
	ES: 'Europe/Madrid',
	PT: 'Europe/Lisbon',
	IT: 'Europe/Rome',
	NL: 'Europe/Amsterdam',
	BE: 'Europe/Brussels',
	CH: 'Europe/Zurich',
	AT: 'Europe/Vienna',
	SE: 'Europe/Stockholm',
	NO: 'Europe/Oslo',
	DK: 'Europe/Copenhagen',
	FI: 'Europe/Helsinki',
	PL: 'Europe/Warsaw',
	BR: 'America/Sao_Paulo',
	AR: 'America/Argentina/Buenos_Aires',
	CL: 'America/Santiago',
	CO: 'America/Bogota',
	JP: 'Asia/Tokyo',
	AU: 'Australia/Sydney',
	NZ: 'Pacific/Auckland',
	IN: 'Asia/Kolkata',
};

const buildBody = (params: MessagesWithWebSearchParams): unknown => {
	const timezone = COUNTRY_TIMEZONE[params.locationCountry];
	const userLocation: Record<string, string> = {
		type: 'approximate',
		country: params.locationCountry,
	};
	if (timezone) {
		userLocation.timezone = timezone;
	}
	return {
		model: params.model,
		max_tokens: 4000,
		temperature: 0,
		tools: [
			{
				type: 'web_search_20250305',
				name: 'web_search',
				max_uses: WEB_SEARCH_MAX_USES,
				user_location: userLocation,
			},
		],
		// Force web_search instead of `{ type: 'auto' }`. With `auto`, Claude
		// can decide to answer from training data and skip the tool entirely
		// — that silently zeroes the citation rate metric AND, for some
		// locale × prompt combinations, surfaces as 400s on the messages
		// endpoint when no tool is chosen.
		tool_choice: { type: 'tool', name: 'web_search' },
		messages: [{ role: 'user', content: params.prompt }],
		metadata: {
			user_id: params.brandPromptId,
		},
	};
};

export const fetchMessagesWithWebSearch = async (
	http: AnthropicHttp,
	params: MessagesWithWebSearchParams,
	ctx: FetchContext,
): Promise<AnthropicMessagesPayload> => {
	const apiKey = parseCredential(ctx.credential.plaintextSecret);
	const body = buildBody(params);
	const raw = (await http.post('/messages', body, apiKey, ctx.signal)) as AnthropicMessagesPayload;
	if (!raw || typeof raw !== 'object') {
		ctx.logger.warn('Anthropic /messages returned non-object body', { raw });
		return {};
	}
	return raw;
};
