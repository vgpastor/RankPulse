import type { LocationLanguage } from '../../project-management/value-objects/location-language.js';
import type { BrandMention } from '../value-objects/brand-mention.js';
import type { BrandWatchEntry } from '../value-objects/brand-watch-entry.js';
import type { Citation } from '../value-objects/citation.js';
import type { TokenUsage } from '../value-objects/token-usage.js';

export interface MentionExtractorInput {
	readonly rawText: string;
	readonly promptText: string;
	readonly location: LocationLanguage;
	readonly watchlist: readonly BrandWatchEntry[];
	/** Citations the upstream LLM produced (already attributed to ownDomain). */
	readonly citations: readonly Citation[];
}

export interface MentionExtractorResult {
	readonly mentions: readonly BrandMention[];
	/**
	 * The judge's own token usage (we add this to the answer's TokenUsage so
	 * the cost ledger reflects extraction cost too). Not meant to replace the
	 * upstream LLM-search call's token usage.
	 */
	readonly judgeTokenUsage: TokenUsage;
	readonly judgeCostCents: number;
}

/**
 * Adapter port for the LLM-as-judge that converts raw answer text + a
 * watchlist into structured `BrandMention[]`. Implementations live in
 * `infrastructure/ai-search-insights/` (default: Anthropic Claude Haiku with
 * prompt caching).
 *
 * Designed to be deterministic enough for testing: `temperature: 0` is
 * mandatory at the implementation level. Callers MAY retry on transient
 * failures; the use case treats a thrown error as "no mentions extracted"
 * only after policy retries are exhausted.
 */
export interface MentionExtractor {
	extract(input: MentionExtractorInput): Promise<MentionExtractorResult>;
}
