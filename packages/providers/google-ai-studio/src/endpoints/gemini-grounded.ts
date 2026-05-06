import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import { parseCredential } from '../credential.js';
import type { GoogleAiStudioHttp } from '../http.js';

/**
 * `gemini-2.5-flash` is Google's commodity-tier multimodal model with
 * built-in `googleSearch` grounding. Cheapest of the AI Brand Radar
 * fan-out at our prompt sizes, and the only one of the four whose web
 * tool is actually free for the first 1500 calls/day per project (Google
 * subsidises grounding to incentivise usage of the tool).
 */
const DEFAULT_MODEL = 'gemini-2.5-flash';

/**
 * Gemini `generateContent` with `googleSearch` tool enabled. Same shape
 * as the OpenAI/Anthropic/Perplexity endpoints so the auto-schedule
 * handler treats every AI provider uniformly.
 */
export const GeminiGroundedParams = z.object({
	prompt: z.string().min(3).max(1000),
	locationCountry: z.string().regex(/^[A-Z]{2}$/),
	locationLanguage: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
	model: z.string().min(2).default(DEFAULT_MODEL),
	brandPromptId: z.string().uuid(),
});
export type GeminiGroundedParams = z.infer<typeof GeminiGroundedParams>;

/**
 * Pricing (validated against Google AI Studio public pricing as of January
 * 2026):
 *  - gemini-2.5-flash: input $0.30/1M, output $2.50/1M.
 *  - googleSearch tool: 1500 grounded queries/day FREE per project, then
 *    $35/1k = 3.5 cents per call. We pin descriptor cost to the paid-tier
 *    upper bound so the ledger doesn't undercount once the free quota
 *    is spent (typical 30-prompt × 4-locale fan-out runs at 120 calls/day,
 *    well within free).
 *
 * Worst-case call: 200 input + 4000 output + 1 grounded query
 *   ≈ 0.006 + 1.0 + 3.5 cents ≈ 4.5 cents.
 */
export const GEMINI_WORST_CASE_COST_CENTS = 4.5;

export const geminiGroundedDescriptor: EndpointDescriptor = {
	id: 'google-ai-studio-gemini-grounded',
	category: 'brand',
	displayName: 'Google AI Studio — Gemini (grounded)',
	description:
		'Calls Google AI Studio /v1beta/models/{model}:generateContent with the googleSearch tool, captures the grounded answer + citations from groundingMetadata, and ships them to the AI Brand Radar pipeline.',
	paramsSchema: GeminiGroundedParams,
	cost: { unit: 'usd_cents', amount: GEMINI_WORST_CASE_COST_CENTS },
	defaultCron: '0 7 * * *',
	rateLimit: { max: 60, durationMs: 60_000 },
};

export interface GeminiUsageMetadata {
	promptTokenCount?: number;
	candidatesTokenCount?: number;
	totalTokenCount?: number;
	cachedContentTokenCount?: number;
}

export interface GeminiGroundingChunk {
	web?: { uri?: string; title?: string };
}

export interface GeminiGroundingMetadata {
	groundingChunks?: GeminiGroundingChunk[];
	groundingSupports?: unknown[];
	webSearchQueries?: string[];
}

export interface GeminiPart {
	text?: string;
}

export interface GeminiCandidate {
	content?: { role?: string; parts?: GeminiPart[] };
	finishReason?: string;
	groundingMetadata?: GeminiGroundingMetadata;
}

export interface GeminiPayload {
	candidates?: GeminiCandidate[];
	usageMetadata?: GeminiUsageMetadata;
	modelVersion?: string;
}

const buildBody = (params: GeminiGroundedParams): unknown => ({
	contents: [
		{
			role: 'user',
			parts: [{ text: params.prompt }],
		},
	],
	tools: [{ googleSearch: {} }],
	generationConfig: {
		temperature: 0,
		maxOutputTokens: 4000,
	},
	systemInstruction: {
		// AI Studio honours BCP-47 locale hints inside the system instruction;
		// Gemini surfaces locale-correct sources when this is present.
		parts: [
			{
				text: `Answer the user's question naturally. The user is browsing from ${params.locationCountry} and prefers responses in ${params.locationLanguage}.`,
			},
		],
	},
});

const buildPath = (model: string): string => `/models/${encodeURIComponent(model)}:generateContent`;

export const fetchGeminiGrounded = async (
	http: GoogleAiStudioHttp,
	params: GeminiGroundedParams,
	ctx: FetchContext,
): Promise<GeminiPayload> => {
	const apiKey = parseCredential(ctx.credential.plaintextSecret);
	const body = buildBody(params);
	const raw = (await http.post(buildPath(params.model), body, apiKey, ctx.signal)) as GeminiPayload;
	if (!raw || typeof raw !== 'object') {
		ctx.logger.warn('Google AI Studio generateContent returned non-object body', { raw });
		return {};
	}
	return raw;
};
