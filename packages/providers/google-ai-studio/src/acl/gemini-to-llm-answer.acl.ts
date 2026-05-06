import { AiSearchInsights } from '@rankpulse/domain';
import type { GeminiPayload } from '../endpoints/gemini-grounded.js';

export interface NormalisedLlmAnswer {
	readonly aiProvider: AiSearchInsights.AiProviderName;
	readonly model: string;
	readonly rawText: string;
	readonly citationUrls: readonly string[];
	readonly tokenUsage: AiSearchInsights.TokenUsage;
	readonly costCents: number;
}

/**
 * Gemini pricing per 1M tokens (USD), validated January 2026:
 *  - gemini-2.5-flash:    $0.30 input / $2.50 output
 *  - gemini-2.5-pro:      $1.25 input / $10.00 output
 *  - gemini-2.5-flash-lite: $0.10 input / $0.40 output (no grounding tool)
 *
 * Grounding queries: first 1500/day/project free, then $35/1k = 3.5 cents
 * per call. We assume paid-tier pricing in the ledger (the worst-case),
 * which makes the cost figure conservative but never wrong.
 */
const PRICING = {
	'gemini-2.5-flash': { inputPerM: 0.3, outputPerM: 2.5 },
	'gemini-2.5-pro': { inputPerM: 1.25, outputPerM: 10.0 },
	default: { inputPerM: 0.3, outputPerM: 2.5 },
} as const;

const GROUNDING_CENTS_PER_QUERY = 3.5;

const computeCostCents = (model: string, usage: AiSearchInsights.TokenUsage): number => {
	const tier =
		(PRICING as Record<string, { inputPerM: number; outputPerM: number }>)[model] ?? PRICING.default;
	const uncachedInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
	const inputDollars = (uncachedInput * tier.inputPerM) / 1_000_000;
	const outputDollars = (usage.outputTokens * tier.outputPerM) / 1_000_000;
	const tokenCents = (inputDollars + outputDollars) * 100;
	const groundingCents = usage.webSearchCalls * GROUNDING_CENTS_PER_QUERY;
	return Math.round((tokenCents + groundingCents) * 10000) / 10000;
};

/**
 * Gemini puts the assistant's answer in `candidates[0].content.parts[].text`
 * and the citation URLs in `candidates[0].groundingMetadata.groundingChunks[].web.uri`.
 * `webSearchQueries.length` is the count of distinct search queries the
 * model issued (1 per call in our usage pattern, but we trust the response).
 */
export const normaliseGeminiResponse = (raw: GeminiPayload): NormalisedLlmAnswer => {
	const model = raw.modelVersion ?? 'gemini-2.5-flash';
	const candidate = raw.candidates?.[0];
	const text = (candidate?.content?.parts ?? [])
		.map((p) => (typeof p.text === 'string' ? p.text : ''))
		.filter((s) => s.length > 0)
		.join('');

	const urls = new Set<string>();
	for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
		const uri = chunk.web?.uri;
		if (typeof uri === 'string' && uri.length > 0) urls.add(uri);
	}

	const webSearchCalls = candidate?.groundingMetadata?.webSearchQueries?.length ?? 0;

	const tokenUsage = AiSearchInsights.TokenUsage.create({
		inputTokens: raw.usageMetadata?.promptTokenCount ?? 0,
		outputTokens: raw.usageMetadata?.candidatesTokenCount ?? 0,
		cachedInputTokens: raw.usageMetadata?.cachedContentTokenCount ?? 0,
		webSearchCalls,
	});

	return {
		aiProvider: AiSearchInsights.AiProviderNames.GOOGLE_AI_STUDIO,
		model,
		rawText: text,
		citationUrls: [...urls],
		tokenUsage,
		costCents: computeCostCents(model, tokenUsage),
	};
};
