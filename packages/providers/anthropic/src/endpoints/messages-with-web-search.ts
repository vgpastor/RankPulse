import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
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
 * Typical call: 200 input + 800 output tokens + 2 searches
 *   ≈ ~3.2 cents. Pinning the descriptor at 11 cents is the safe ledger
 * upper bound; `costFor` below computes the precise figure post-fetch.
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

const buildBody = (params: MessagesWithWebSearchParams): unknown => ({
	model: params.model,
	max_tokens: 4000,
	temperature: 0,
	tools: [
		{
			type: 'web_search_20250305',
			name: 'web_search',
			max_uses: WEB_SEARCH_MAX_USES,
			user_location: {
				type: 'approximate',
				country: params.locationCountry,
			},
		},
	],
	tool_choice: { type: 'auto' },
	messages: [{ role: 'user', content: params.prompt }],
	metadata: {
		user_id: params.brandPromptId,
	},
});

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
