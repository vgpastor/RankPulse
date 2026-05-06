import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { AiProviderName } from '../value-objects/ai-provider-name.js';
import type { BrandPromptId } from '../value-objects/identifiers.js';

export interface AiSearchPresenceSummary {
	readonly totalAnswers: number;
	readonly answersWithOwnMention: number;
	readonly ownCitationCount: number;
	readonly ownAvgPosition: number | null;
	readonly competitorMentionCount: number;
}

export interface AiSearchSovRow {
	readonly aiProvider: AiProviderName;
	readonly country: string;
	readonly language: string;
	readonly brand: string;
	readonly isOwnBrand: boolean;
	readonly totalAnswers: number;
	readonly answersWithMention: number;
	readonly avgPosition: number | null;
	readonly citationCount: number;
}

export interface AiSearchCitationRow {
	readonly url: string;
	readonly domain: string;
	readonly isOwnDomain: boolean;
	readonly totalCitations: number;
	readonly providers: readonly AiProviderName[];
	readonly firstSeenAt: Date;
	readonly lastSeenAt: Date;
}

export interface AiSearchSovDailyPoint {
	readonly day: string;
	readonly totalAnswers: number;
	readonly answersWithOwnMention: number;
}

export interface AiSearchMatrixCell {
	readonly aiProvider: AiProviderName;
	readonly country: string;
	readonly language: string;
	readonly brand: string;
	readonly isOwnBrand: boolean;
	readonly totalAnswers: number;
	readonly answersWithMention: number;
	readonly avgPosition: number | null;
	readonly mentionRate: number;
}

export interface AiSearchWeeklySovDelta {
	readonly aiProvider: AiProviderName;
	readonly country: string;
	readonly language: string;
	readonly thisWeekTotal: number;
	readonly thisWeekOwnMentions: number;
	readonly lastWeekTotal: number;
	readonly lastWeekOwnMentions: number;
	readonly thisWeekRate: number;
	readonly lastWeekRate: number;
	readonly relativeDelta: number | null;
}

export interface AiSearchOwnCitationStreak {
	readonly url: string;
	readonly domain: string;
	readonly aiProvider: AiProviderName;
	readonly country: string;
	readonly language: string;
	readonly streakDays: number;
	readonly lastSeenAt: Date;
	readonly currentlyCited: boolean;
}

export interface AiSearchPositionLead {
	readonly aiProvider: AiProviderName;
	readonly country: string;
	readonly language: string;
	readonly ownAvgPosition: number | null;
	readonly competitorBrand: string;
	readonly competitorAvgPosition: number | null;
}

export interface AiSearchReadModelFilter {
	readonly from: Date;
	readonly to: Date;
}

/**
 * Read-side projection over `llm_answers`. Implementations run aggregations
 * across captured rows (currently on-the-fly SQL via Drizzle, pluggable to
 * TimescaleDB continuous aggregates in a follow-up without changing the
 * contract).
 *
 * Kept distinct from `LlmAnswerRepository` (the write-side aggregate store)
 * so the read model can evolve — denormalised tables, materialised views —
 * without touching the aggregate-root persistence.
 */
export interface LlmAnswerReadModel {
	presenceForProject(projectId: ProjectId, filter: AiSearchReadModelFilter): Promise<AiSearchPresenceSummary>;
	sovForProject(projectId: ProjectId, filter: AiSearchReadModelFilter): Promise<readonly AiSearchSovRow[]>;
	citationsForProject(
		projectId: ProjectId,
		filter: AiSearchReadModelFilter & { onlyOwnDomains?: boolean; aiProvider?: AiProviderName },
	): Promise<readonly AiSearchCitationRow[]>;
	sovDailyForPrompt(
		brandPromptId: BrandPromptId,
		filter: AiSearchReadModelFilter,
	): Promise<readonly AiSearchSovDailyPoint[]>;
	competitiveMatrixForProject(
		projectId: ProjectId,
		filter: AiSearchReadModelFilter,
	): Promise<readonly AiSearchMatrixCell[]>;
	/**
	 * Returns per (provider × locale) own-brand mention-rate deltas comparing
	 * the most recent 7 days against the prior 7 days. Used by the alert
	 * evaluator to detect SoV regressions.
	 */
	weeklySovDeltaForProject(projectId: ProjectId, asOf: Date): Promise<readonly AiSearchWeeklySovDelta[]>;
	/**
	 * Owned-domain citation streaks: for each (own-domain URL, provider,
	 * locale) returns the longest streak of consecutive days the URL was
	 * cited within the lookback window, plus whether the most recent capture
	 * still cites it.
	 */
	ownCitationStreaksForProject(
		projectId: ProjectId,
		filter: AiSearchReadModelFilter,
	): Promise<readonly AiSearchOwnCitationStreak[]>;
	/**
	 * Competitor average-position lead: per (provider × locale × competitor
	 * brand), returns the competitor's avg_position alongside the own brand's
	 * avg_position so callers can flag the cases where a competitor is ahead.
	 */
	positionLeadsForProject(
		projectId: ProjectId,
		filter: AiSearchReadModelFilter,
	): Promise<readonly AiSearchPositionLead[]>;
}
