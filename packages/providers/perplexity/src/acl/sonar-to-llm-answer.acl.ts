import { AiSearchInsights } from '@rankpulse/domain';
import type { PerplexityChatPayload } from '../endpoints/sonar-search.js';

export interface NormalisedLlmAnswer {
	readonly aiProvider: AiSearchInsights.AiProviderName;
	readonly model: string;
	readonly rawText: string;
	readonly citationUrls: readonly string[];
	readonly tokenUsage: AiSearchInsights.TokenUsage;
	readonly costCents: number;
}

/**
 * Per-1M-token pricing for Perplexity (USD), validated January 2026:
 *  - sonar:        $1 input / $1 output, $5/1k searches = 0.5 cent each.
 *  - sonar-pro:    $3 input / $15 output, $5/1k searches.
 *  - sonar-reasoning: $1 input / $5 output, $5/1k searches.
 *
 * Search cost is bundled per request (not per token) — Perplexity returns
 * `usage.num_search_queries` so we can accurately bill multi-query
 * answers. Most Sonar calls do exactly one search.
 */
const PRICING = {
	sonar: { inputPerM: 1.0, outputPerM: 1.0 },
	'sonar-pro': { inputPerM: 3.0, outputPerM: 15.0 },
	'sonar-reasoning': { inputPerM: 1.0, outputPerM: 5.0 },
	default: { inputPerM: 1.0, outputPerM: 1.0 },
} as const;

const SEARCH_CENTS_PER_QUERY = 0.5;

const computeCostCents = (model: string, usage: AiSearchInsights.TokenUsage): number => {
	const tier =
		(PRICING as Record<string, { inputPerM: number; outputPerM: number }>)[model] ?? PRICING.default;
	const inputDollars = (usage.inputTokens * tier.inputPerM) / 1_000_000;
	const outputDollars = (usage.outputTokens * tier.outputPerM) / 1_000_000;
	const tokenCents = (inputDollars + outputDollars) * 100;
	const searchCents = usage.webSearchCalls * SEARCH_CENTS_PER_QUERY;
	return Math.round((tokenCents + searchCents) * 10000) / 10000;
};

/**
 * Perplexity returns the assistant's answer in `choices[0].message.content`
 * and the URL citations in a top-level `citations: string[]`. Compared to
 * OpenAI/Anthropic, the citations are NOT spliced into the text — they're
 * referenced by `[N]` markers in the body and the array is the expansion.
 *
 * `usage.num_search_queries` reflects the actual searches performed; we
 * map it to `webSearchCalls` for parity with the other providers (cost
 * ledger calls it the same name across the board).
 */
export const normalisePerplexityResponse = (raw: PerplexityChatPayload): NormalisedLlmAnswer => {
	const model = raw.model ?? 'sonar';
	const text = raw.choices?.[0]?.message?.content ?? '';
	const citationUrls = (raw.citations ?? []).filter(
		(url): url is string => typeof url === 'string' && url.length > 0,
	);
	const webSearchCalls = raw.usage?.num_search_queries ?? 1;

	const tokenUsage = AiSearchInsights.TokenUsage.create({
		inputTokens: raw.usage?.prompt_tokens ?? 0,
		outputTokens: raw.usage?.completion_tokens ?? 0,
		cachedInputTokens: 0,
		webSearchCalls,
	});

	return {
		aiProvider: AiSearchInsights.AiProviderNames.PERPLEXITY,
		model,
		rawText: text,
		citationUrls: [...new Set(citationUrls)],
		tokenUsage,
		costCents: computeCostCents(model, tokenUsage),
	};
};
