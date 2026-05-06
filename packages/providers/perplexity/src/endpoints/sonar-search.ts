import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import { parseCredential } from '../credential.js';
import type { PerplexityHttp } from '../http.js';

/**
 * `sonar` is Perplexity's commodity-tier grounded model — built-in web search
 * (no tool plumbing needed), fast, cheap. `sonar-pro` is the premium variant
 * but doesn't add value for our use case (we don't need reasoning depth, we
 * need brand presence in answers a regular user would get).
 */
const DEFAULT_MODEL = 'sonar';

/**
 * Perplexity Sonar — grounded chat completion. Citations come back in a
 * top-level `citations: string[]` array (URLs), separate from the message
 * content. Matches the same `(prompt, locationCountry, locationLanguage,
 * model, brandPromptId)` shape used by the other AI providers.
 */
export const SonarSearchParams = z.object({
	prompt: z.string().min(3).max(1000),
	locationCountry: z.string().regex(/^[A-Z]{2}$/),
	locationLanguage: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
	model: z.string().min(2).default(DEFAULT_MODEL),
	brandPromptId: z.string().uuid(),
});
export type SonarSearchParams = z.infer<typeof SonarSearchParams>;

/**
 * Pricing (validated against Perplexity public pricing as of January 2026):
 *  - sonar (basic): $1/1M input, $1/1M output, $5/1k requests = 0.5 cent
 *    per request (search is bundled).
 *  - Worst-case 200 input + 1500 output + 1 request ≈ 0.5 + 0.17 ≈ 0.67 cents.
 *
 * Pinning at 1.5 cents leaves headroom for `sonar-pro` overrides without
 * needing per-model dispatch in the worker.
 */
export const SONAR_WORST_CASE_COST_CENTS = 1.5;

export const sonarSearchDescriptor: EndpointDescriptor = {
	id: 'perplexity-sonar-search',
	category: 'brand',
	displayName: 'Perplexity — Sonar (grounded)',
	description:
		'Calls Perplexity /chat/completions with a Sonar model — every response is grounded by built-in web search, returning the answer text + URL citations for the AI Brand Radar pipeline.',
	paramsSchema: SonarSearchParams,
	cost: { unit: 'usd_cents', amount: SONAR_WORST_CASE_COST_CENTS },
	defaultCron: '0 7 * * *',
	rateLimit: { max: 50, durationMs: 60_000 },
};

export interface PerplexityUsage {
	prompt_tokens?: number;
	completion_tokens?: number;
	total_tokens?: number;
	num_search_queries?: number;
}

export interface PerplexityChoice {
	index?: number;
	message?: { role?: string; content?: string };
	finish_reason?: string;
}

export interface PerplexityChatPayload {
	id?: string;
	model?: string;
	object?: string;
	choices?: PerplexityChoice[];
	citations?: readonly string[];
	usage?: PerplexityUsage;
}

const buildBody = (params: SonarSearchParams): unknown => ({
	model: params.model,
	messages: [{ role: 'user', content: params.prompt }],
	temperature: 0,
	max_tokens: 4000,
	web_search_options: {
		search_context_size: 'medium',
		user_location: { country: params.locationCountry },
	},
	// Perplexity ignores unknown top-level keys but accepts `metadata` as
	// a free-form JSON blob echoed back on the response — useful for
	// log correlation when running concurrent fan-outs.
	metadata: {
		brand_prompt_id: params.brandPromptId,
		language: params.locationLanguage,
	},
});

export const fetchSonarSearch = async (
	http: PerplexityHttp,
	params: SonarSearchParams,
	ctx: FetchContext,
): Promise<PerplexityChatPayload> => {
	const apiKey = parseCredential(ctx.credential.plaintextSecret);
	const body = buildBody(params);
	const raw = (await http.post('/chat/completions', body, apiKey, ctx.signal)) as PerplexityChatPayload;
	if (!raw || typeof raw !== 'object') {
		ctx.logger.warn('Perplexity /chat/completions returned non-object body', { raw });
		return {};
	}
	return raw;
};
