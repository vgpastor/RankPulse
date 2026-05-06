import { AiSearchInsights } from '@rankpulse/domain';
import type { AnthropicMessagesPayload } from '../endpoints/messages-with-web-search.js';

export interface NormalisedLlmAnswer {
	readonly aiProvider: AiSearchInsights.AiProviderName;
	readonly model: string;
	readonly rawText: string;
	readonly citationUrls: readonly string[];
	readonly tokenUsage: AiSearchInsights.TokenUsage;
	readonly costCents: number;
}

/**
 * Anthropic Sonnet 4.6 pricing per 1M tokens (USD). Cached reads at $0.30
 * are 10x cheaper than uncached input; cache writes carry a $3.75 surcharge
 * (5-min TTL, applied to cache_creation_input_tokens). Web search is billed
 * at $10/1k = 1 cent per request.
 */
const PRICING = {
	'claude-sonnet-4-6': { inputPerM: 3.0, outputPerM: 15.0, cachedReadPerM: 0.3, cacheWritePerM: 3.75 },
	'claude-haiku-4-5-20251001': {
		inputPerM: 0.8,
		outputPerM: 4.0,
		cachedReadPerM: 0.08,
		cacheWritePerM: 1.0,
	},
	default: { inputPerM: 3.0, outputPerM: 15.0, cachedReadPerM: 0.3, cacheWritePerM: 3.75 },
} as const;

const WEB_SEARCH_CENTS_PER_CALL = 1;

const computeCostCents = (model: string, usage: AiSearchInsights.TokenUsage, cacheWrites: number): number => {
	const tier =
		(
			PRICING as Record<
				string,
				{ inputPerM: number; outputPerM: number; cachedReadPerM: number; cacheWritePerM: number }
			>
		)[model] ?? PRICING.default;
	const uncachedInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
	const inputDollars = (uncachedInput * tier.inputPerM) / 1_000_000;
	const cachedDollars = (usage.cachedInputTokens * tier.cachedReadPerM) / 1_000_000;
	const cacheWriteDollars = (cacheWrites * tier.cacheWritePerM) / 1_000_000;
	const outputDollars = (usage.outputTokens * tier.outputPerM) / 1_000_000;
	const tokenCents = (inputDollars + cachedDollars + cacheWriteDollars + outputDollars) * 100;
	const webSearchCents = usage.webSearchCalls * WEB_SEARCH_CENTS_PER_CALL;
	return Math.round((tokenCents + webSearchCents) * 10000) / 10000;
};

/**
 * Walks `content[]` blocks, joins the assistant text, and harvests citation
 * URLs (Anthropic exposes them as `web_search_result_location` entries on
 * each text block's `citations` array — one URL can appear under multiple
 * text blocks, hence the de-duplication via Set).
 *
 * `tool_use` and `tool_result` blocks are skipped — they're the model's
 * internal scaffolding (the search query and the search results), not the
 * answer it produced for the user.
 */
export const normaliseAnthropicResponse = (raw: AnthropicMessagesPayload): NormalisedLlmAnswer => {
	const model = raw.model ?? 'claude-sonnet-4-6';
	const text = extractText(raw.content);
	const citationUrls = extractCitations(raw.content);
	const webSearchCalls = raw.usage?.server_tool_use?.web_search_requests ?? 0;

	const tokenUsage = AiSearchInsights.TokenUsage.create({
		inputTokens: raw.usage?.input_tokens ?? 0,
		outputTokens: raw.usage?.output_tokens ?? 0,
		cachedInputTokens: raw.usage?.cache_read_input_tokens ?? 0,
		webSearchCalls,
	});
	const cacheWrites = raw.usage?.cache_creation_input_tokens ?? 0;

	return {
		aiProvider: AiSearchInsights.AiProviderNames.ANTHROPIC,
		model,
		rawText: text,
		citationUrls,
		tokenUsage,
		costCents: computeCostCents(model, tokenUsage, cacheWrites),
	};
};

const extractText = (content: AnthropicMessagesPayload['content']): string => {
	if (!Array.isArray(content)) return '';
	const parts: string[] = [];
	for (const block of content) {
		if (block.type !== 'text') continue;
		if (typeof block.text === 'string') parts.push(block.text);
	}
	return parts.join('\n');
};

const extractCitations = (content: AnthropicMessagesPayload['content']): string[] => {
	if (!Array.isArray(content)) return [];
	const urls = new Set<string>();
	for (const block of content) {
		if (block.type !== 'text') continue;
		for (const c of block.citations ?? []) {
			if (typeof c.url === 'string' && c.url.length > 0) urls.add(c.url);
		}
	}
	return [...urls];
};
