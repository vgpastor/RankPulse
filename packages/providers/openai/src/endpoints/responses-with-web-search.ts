import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import { parseCredential } from '../credential.js';
import type { OpenAiHttp } from '../http.js';

/**
 * The default model. `gpt-5-mini` is OpenAI's commodity-tier reasoning model
 * with web_search tool support; cheap enough for daily fan-out and good
 * enough at following the "answer the user's prompt naturally" instruction.
 */
const DEFAULT_MODEL = 'gpt-5-mini';

/**
 * `/v1/responses` with `tools: [{ type: 'web_search' }]`. The system
 * instruction is intentionally minimal — we want the LLM to behave the way
 * it would when an end user asks it the same question, NOT to be primed
 * about brand monitoring. The watchlist is applied later by the LLM-judge
 * (`MentionExtractor`), keeping the captured raw text uncontaminated.
 */
export const ResponsesWithWebSearchParams = z.object({
	/** The exact prompt the user wants to monitor. */
	prompt: z.string().min(3).max(1000),
	/** Country (ISO 3166-1 alpha-2) and language hints for grounding. */
	locationCountry: z.string().regex(/^[A-Z]{2}$/),
	locationLanguage: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
	/** Defaults to gpt-5-mini for cost; user can override per BrandPrompt. */
	model: z.string().min(2).default(DEFAULT_MODEL),
	/**
	 * The BrandPrompt id this fetch was scheduled for. Carried as a
	 * systemParam by the auto-schedule handler so the worker's processor
	 * can route the captured response back to the right RecordLlmAnswer
	 * use case invocation. Kept on the descriptor's params for traceability
	 * (`raw_payloads.params` always shows which prompt produced which
	 * payload), even though the provider HTTP call doesn't need it.
	 */
	brandPromptId: z.string().uuid(),
});
export type ResponsesWithWebSearchParams = z.infer<typeof ResponsesWithWebSearchParams>;

/**
 * Pricing (validated against OpenAI public pricing as of January 2026):
 *
 *  - Token cost dwarfed by web_search call: $30 per 1k searches = 3 cents/call.
 *  - Token component for gpt-5-mini: input $0.40/1M, output $1.60/1M.
 *  - Average response (~200 input + 500 output tokens) → ~0.1 cents in tokens.
 *
 * We pin the descriptor's `cost.amount` to the worst case (3.5 cents) and
 * compute the precise figure in `costFor` once the response usage is known.
 */
export const RESPONSES_WORST_CASE_COST_CENTS = 3.5;

export const responsesWithWebSearchDescriptor: EndpointDescriptor = {
	id: 'openai-responses-with-web-search',
	category: 'brand',
	displayName: 'OpenAI — Responses + web_search',
	description:
		'Calls OpenAI /v1/responses with the web_search tool enabled, captures the grounded answer + URL citations, and ships the raw text + citations to the AI Brand Radar pipeline.',
	paramsSchema: ResponsesWithWebSearchParams,
	cost: { unit: 'usd_cents', amount: RESPONSES_WORST_CASE_COST_CENTS },
	defaultCron: '0 7 * * *',
	rateLimit: { max: 500, durationMs: 60_000 },
};

export interface OpenAiResponseUsage {
	input_tokens?: number;
	output_tokens?: number;
	total_tokens?: number;
	input_tokens_details?: { cached_tokens?: number };
}

export interface OpenAiResponseAnnotation {
	type?: string;
	url?: string;
	title?: string;
	start_index?: number;
	end_index?: number;
}

export interface OpenAiResponseContentItem {
	type?: string;
	text?: string;
	annotations?: OpenAiResponseAnnotation[];
}

export interface OpenAiResponseOutputItem {
	type?: string;
	id?: string;
	role?: string;
	status?: string;
	content?: OpenAiResponseContentItem[];
}

export interface OpenAiResponsePayload {
	id?: string;
	model?: string;
	output?: OpenAiResponseOutputItem[];
	output_text?: string;
	usage?: OpenAiResponseUsage;
}

const buildBody = (params: ResponsesWithWebSearchParams): unknown => ({
	model: params.model,
	input: params.prompt,
	tools: [{ type: 'web_search' }],
	tool_choice: 'auto',
	temperature: 0,
	// 4000 tokens covers nearly every realistic LLM-search answer; longer
	// answers either truncate (acceptable for our use case) or fail with
	// 400 if the prompt+tools blow the model's context.
	max_output_tokens: 4000,
	// Provide the locale as user metadata. The Responses API doesn't
	// formally accept a locale param, but `metadata.location_*` is propagated
	// into the model's prompt context and biases the web_search results.
	metadata: {
		country: params.locationCountry,
		language: params.locationLanguage,
		brand_prompt_id: params.brandPromptId,
	},
});

export const fetchResponsesWithWebSearch = async (
	http: OpenAiHttp,
	params: ResponsesWithWebSearchParams,
	ctx: FetchContext,
): Promise<OpenAiResponsePayload> => {
	const apiKey = parseCredential(ctx.credential.plaintextSecret);
	const body = buildBody(params);
	const raw = (await http.post('/responses', body, apiKey, ctx.signal)) as OpenAiResponsePayload;
	if (!raw || typeof raw !== 'object') {
		ctx.logger.warn('OpenAI /responses returned non-object body', { raw });
		return {};
	}
	return raw;
};
