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
}
