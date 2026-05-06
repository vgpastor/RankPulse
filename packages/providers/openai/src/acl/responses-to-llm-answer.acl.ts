import { AiSearchInsights } from '@rankpulse/domain';
import type { OpenAiResponsePayload } from '../endpoints/responses-with-web-search.js';

/**
 * Normalised projection that the worker's processor passes to the
 * `RecordLlmAnswerUseCase`. Every provider in `ai-search-insights` produces
 * this same shape from its own raw response — that's the contract the
 * domain operates on, regardless of upstream LLM vendor.
 */
export interface NormalisedLlmAnswer {
	readonly aiProvider: AiSearchInsights.AiProviderName;
	readonly model: string;
	readonly rawText: string;
	readonly citationUrls: readonly string[];
	readonly tokenUsage: AiSearchInsights.TokenUsage;
	readonly costCents: number;
}

/**
 * Token cost for gpt-5-mini, per 1M tokens (USD).
 * input: $0.40, output: $1.60, cached input: $0.10. Web_search billed as
 * a flat $30 per 1k calls = 3 cents per call.
 */
const PRICING = {
	'gpt-5-mini': { inputPerM: 0.4, outputPerM: 1.6, cachedInputPerM: 0.1 },
	'gpt-5-mini-search': { inputPerM: 0.4, outputPerM: 1.6, cachedInputPerM: 0.1 },
	default: { inputPerM: 0.4, outputPerM: 1.6, cachedInputPerM: 0.1 },
} as const;

const WEB_SEARCH_CENTS_PER_CALL = 3;

const computeCostCents = (model: string, usage: AiSearchInsights.TokenUsage): number => {
	const tier =
		(PRICING as Record<string, { inputPerM: number; outputPerM: number; cachedInputPerM: number }>)[model] ??
		PRICING.default;
	const inputDollars = ((usage.inputTokens - usage.cachedInputTokens) * tier.inputPerM) / 1_000_000;
	const cachedDollars = (usage.cachedInputTokens * tier.cachedInputPerM) / 1_000_000;
	const outputDollars = (usage.outputTokens * tier.outputPerM) / 1_000_000;
	const tokenCents = (inputDollars + cachedDollars + outputDollars) * 100;
	const webSearchCents = usage.webSearchCalls * WEB_SEARCH_CENTS_PER_CALL;
	// Round to 4 decimals to keep the ledger compact without losing
	// fractional cents (a single call costs ~3.0001 cents).
	return Math.round((tokenCents + webSearchCents) * 10000) / 10000;
};

/**
 * Walks the `output[]` array, joining the assistant text spans into a single
 * `rawText` and collecting `url_citation` annotations into `citationUrls`.
 * Non-assistant items (web_search_call markers, refusal items) are skipped.
 *
 * `output_text` is the API's convenience aggregation of the assistant's
 * `output_text` content items — we prefer it when present and fall back to
 * walking `content[]` ourselves only if it's missing (older API versions).
 */
export const normaliseOpenAiResponse = (raw: OpenAiResponsePayload): NormalisedLlmAnswer => {
	const model = raw.model ?? 'gpt-5-mini';
	const text = raw.output_text ?? extractTextFromOutput(raw.output);
	const citationUrls = extractCitations(raw.output);
	const webSearchCalls = countWebSearchCalls(raw.output);

	const tokenUsage = AiSearchInsights.TokenUsage.create({
		inputTokens: raw.usage?.input_tokens ?? 0,
		outputTokens: raw.usage?.output_tokens ?? 0,
		cachedInputTokens: raw.usage?.input_tokens_details?.cached_tokens ?? 0,
		webSearchCalls,
	});

	return {
		aiProvider: AiSearchInsights.AiProviderNames.OPENAI,
		model,
		rawText: text,
		citationUrls,
		tokenUsage,
		costCents: computeCostCents(model, tokenUsage),
	};
};

const extractTextFromOutput = (output: OpenAiResponsePayload['output']): string => {
	if (!Array.isArray(output)) return '';
	const parts: string[] = [];
	for (const item of output) {
		if (item.type !== 'message') continue;
		for (const c of item.content ?? []) {
			if (c.type === 'output_text' && typeof c.text === 'string') {
				parts.push(c.text);
			}
		}
	}
	return parts.join('\n');
};

const extractCitations = (output: OpenAiResponsePayload['output']): string[] => {
	if (!Array.isArray(output)) return [];
	const urls = new Set<string>();
	for (const item of output) {
		if (item.type !== 'message') continue;
		for (const c of item.content ?? []) {
			for (const a of c.annotations ?? []) {
				if (a.type === 'url_citation' && typeof a.url === 'string' && a.url.length > 0) {
					urls.add(a.url);
				}
			}
		}
	}
	return [...urls];
};

const countWebSearchCalls = (output: OpenAiResponsePayload['output']): number => {
	if (!Array.isArray(output)) return 0;
	return output.filter((item) => item.type === 'web_search_call').length;
};
