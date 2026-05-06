import { AiSearchInsights } from '@rankpulse/domain';
import { InvalidInputError } from '@rankpulse/shared';

export interface AnthropicMentionExtractorOptions {
	apiKey: string;
	model?: string;
	baseUrl?: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}

const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_TIMEOUT_MS = 30_000;
const ANTHROPIC_VERSION_HEADER = '2023-06-01';

/**
 * Pricing for claude-haiku-4-5 per 1M tokens (USD), validated April 2026:
 *  - Input (uncached):  $0.80
 *  - Input (cached read): $0.08
 *  - Cache write surcharge: $1.00 (5-min TTL) — first call only.
 *  - Output: $4.00
 *
 * Caching note: Anthropic only caches prompt blocks ≥2048 tokens for Haiku
 * (≥1024 for Sonnet/Opus). Our system instruction below is ~500 tokens, so
 * `cache_control` is currently a no-op for Haiku — we still ship it so it
 * engages automatically the day Anthropic lowers the threshold or we move
 * the watchlist into the cached block. Today's cost per call is the
 * uncached price; ~$0.0009 per extraction at typical sizes (~200 input
 * + ~150 output). 3600 calls/month ≈ $3.20.
 */
const PRICING = {
	inputPerM: 0.8,
	cachedReadPerM: 0.08,
	cacheWritePerM: 1.0,
	outputPerM: 4.0,
} as const;

const SYSTEM_INSTRUCTION = `You are a brand mention extractor for an SEO analytics tool.

Given:
  1) The original user-facing prompt (what the user wanted answered).
  2) The LLM response text generated for that prompt.
  3) A watchlist of brands to detect (with their aliases).

Your job:
  - Detect every mention of any watchlist brand in the response text.
  - For each mention, output:
      brand:     the canonical name from the watchlist (NOT the alias used).
      position:  1-based ordinal of the brand's FIRST mention in the response
                 (1 = the first brand mentioned anywhere in the answer, 2 =
                 the second distinct brand mentioned, etc.). If two brands
                 first appear at the same position, prefer the one that
                 reads first left-to-right.
      sentiment: positive | neutral | negative | mixed — describing how the
                 response talks about THIS specific brand (not the overall
                 tone). "Best in class" → positive; "has bugs" → negative;
                 "is mentioned alongside other tools" → neutral.
      citedUrl:  if the response cites a URL ALONGSIDE the brand mention
                 (within 200 characters of the brand name), copy the URL
                 here. null otherwise.

Rules:
  - Do NOT detect brands that are not in the watchlist.
  - One row per (brand, position). If a brand is mentioned multiple times,
    use the earliest position only.
  - Casing-insensitive matching, but punctuation-sensitive ("Apple" matches
    "apple" but not "apples" unless an alias explicitly allows it).
  - Output via the extract_mentions tool. No prose. No markdown.`;

interface AnthropicResponse {
	id?: string;
	type?: string;
	role?: string;
	content?: Array<{
		type?: string;
		name?: string;
		input?: { mentions?: ExtractedMentionShape[] };
	}>;
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
		cache_creation_input_tokens?: number;
		cache_read_input_tokens?: number;
	};
}

interface ExtractedMentionShape {
	brand?: string;
	position?: number;
	sentiment?: string;
	citedUrl?: string | null;
}

/**
 * LLM-as-judge adapter for the `MentionExtractor` port. Calls Anthropic
 * Claude Haiku with prompt caching on the system instruction so repeated
 * calls inside a 5-min window are 10x cheaper than the first one.
 *
 * NOT a `Provider` — this is an internal infrastructure detail. The
 * upstream LLM-search call (OpenAI, Perplexity, etc.) is the user-facing
 * provider; this judge runs on top of every captured response.
 */
export class AnthropicMentionExtractor implements AiSearchInsights.MentionExtractor {
	private readonly apiKey: string;
	private readonly model: string;
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;
	private readonly timeoutMs: number;

	constructor(options: AnthropicMentionExtractorOptions) {
		if (!options.apiKey || options.apiKey.length < 20) {
			throw new InvalidInputError('AnthropicMentionExtractor requires a non-empty apiKey');
		}
		this.apiKey = options.apiKey;
		this.model = options.model ?? DEFAULT_MODEL;
		this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
		this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	}

	async extract(
		input: AiSearchInsights.MentionExtractorInput,
	): Promise<AiSearchInsights.MentionExtractorResult> {
		const userMessage = buildUserMessage(input);

		const body = {
			model: this.model,
			max_tokens: 1024,
			temperature: 0,
			system: [
				{
					type: 'text',
					text: SYSTEM_INSTRUCTION,
					cache_control: { type: 'ephemeral' },
				},
			],
			tools: [
				{
					name: 'extract_mentions',
					description: 'Output the list of brand mentions extracted from the response.',
					input_schema: {
						type: 'object',
						properties: {
							mentions: {
								type: 'array',
								items: {
									type: 'object',
									properties: {
										brand: { type: 'string' },
										position: { type: 'integer', minimum: 1 },
										sentiment: { enum: ['positive', 'neutral', 'negative', 'mixed'] },
										citedUrl: { type: ['string', 'null'] },
									},
									required: ['brand', 'position', 'sentiment'],
								},
							},
						},
						required: ['mentions'],
					},
				},
			],
			tool_choice: { type: 'tool', name: 'extract_mentions' },
			messages: [{ role: 'user', content: userMessage }],
		};

		const internalAbort = new AbortController();
		const timeout = setTimeout(() => internalAbort.abort(), this.timeoutMs);
		try {
			const response = await this.fetchImpl(`${this.baseUrl}/messages`, {
				method: 'POST',
				headers: {
					'x-api-key': this.apiKey,
					'anthropic-version': ANTHROPIC_VERSION_HEADER,
					'content-type': 'application/json',
				},
				body: JSON.stringify(body),
				signal: internalAbort.signal,
			});
			const text = await response.text();
			if (!response.ok) {
				throw new Error(`Anthropic /messages returned ${response.status}: ${text.slice(0, 500)}`);
			}
			const parsed = JSON.parse(text) as AnthropicResponse;
			return this.toResult(parsed, input.watchlist, input.citations);
		} finally {
			clearTimeout(timeout);
		}
	}

	private toResult(
		raw: AnthropicResponse,
		watchlist: readonly AiSearchInsights.BrandWatchEntry[],
		citations: readonly AiSearchInsights.Citation[],
	): AiSearchInsights.MentionExtractorResult {
		const toolUse = (raw.content ?? []).find((c) => c.type === 'tool_use' && c.name === 'extract_mentions');
		const candidates: ExtractedMentionShape[] = toolUse?.input?.mentions ?? [];

		const watchlistByName = new Map<string, AiSearchInsights.BrandWatchEntry>();
		for (const w of watchlist) {
			watchlistByName.set(w.name.toLowerCase(), w);
			for (const a of w.aliases) {
				watchlistByName.set(a.toLowerCase(), w);
			}
		}

		const mentions: AiSearchInsights.BrandMention[] = [];
		const seenCanonical = new Set<string>();
		for (const c of candidates) {
			if (typeof c.brand !== 'string' || typeof c.position !== 'number') continue;
			const known = watchlistByName.get(c.brand.toLowerCase());
			if (!known) continue;
			if (seenCanonical.has(known.name)) continue;
			seenCanonical.add(known.name);

			const citedUrl = pickValidCitation(c.citedUrl ?? null, citations);
			const sentimentRaw = c.sentiment ?? '';
			const sentiment: AiSearchInsights.Sentiment = AiSearchInsights.isSentiment(sentimentRaw)
				? sentimentRaw
				: 'neutral';
			mentions.push(
				AiSearchInsights.BrandMention.create({
					brand: known.name,
					position: c.position,
					sentiment,
					citedUrl,
					isOwnBrand: known.isOwnBrand,
				}),
			);
		}

		const usage = raw.usage ?? {};
		const judgeTokenUsage = AiSearchInsights.TokenUsage.create({
			inputTokens: usage.input_tokens ?? 0,
			outputTokens: usage.output_tokens ?? 0,
			cachedInputTokens: usage.cache_read_input_tokens ?? 0,
			webSearchCalls: 0,
		});
		const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
		const judgeCostCents = computeCostCents(judgeTokenUsage, cacheWriteTokens);

		return { mentions, judgeTokenUsage, judgeCostCents };
	}
}

const buildUserMessage = (input: AiSearchInsights.MentionExtractorInput): string => {
	const watchlistJson = JSON.stringify(
		input.watchlist.map((w) => ({
			brand: w.name,
			aliases: [...w.aliases],
			isOwnBrand: w.isOwnBrand,
		})),
		null,
		0,
	);
	return [
		`Locale: ${input.location.toString()}`,
		`Watchlist: ${watchlistJson}`,
		`Original prompt: ${input.promptText}`,
		`Response to analyse:\n---\n${input.rawText}\n---`,
	].join('\n\n');
};

const pickValidCitation = (
	candidate: string | null | undefined,
	citations: readonly AiSearchInsights.Citation[],
): string | null => {
	if (!candidate) return null;
	const trimmed = candidate.trim();
	if (trimmed.length === 0) return null;
	// Only accept a citation URL the LLM-judge proposed if it was actually
	// in the upstream LLM's citation list — otherwise the judge hallucinated
	// a URL, which we don't want to persist as truth.
	const valid = citations.some((c) => c.url === trimmed);
	return valid ? trimmed : null;
};

const computeCostCents = (usage: AiSearchInsights.TokenUsage, cacheCreationTokens: number): number => {
	const inputDollars = ((usage.inputTokens - usage.cachedInputTokens) * PRICING.inputPerM) / 1_000_000;
	const cachedDollars = (usage.cachedInputTokens * PRICING.cachedReadPerM) / 1_000_000;
	const cacheWriteDollars = (cacheCreationTokens * PRICING.cacheWritePerM) / 1_000_000;
	const outputDollars = (usage.outputTokens * PRICING.outputPerM) / 1_000_000;
	const cents = (inputDollars + cachedDollars + cacheWriteDollars + outputDollars) * 100;
	return Math.round(cents * 10000) / 10000;
};
