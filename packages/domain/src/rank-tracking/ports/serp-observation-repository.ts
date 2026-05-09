import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { SerpObservation } from '../entities/serp-observation.js';

export interface SerpMapQueryFilter {
	readonly phrase?: string;
	readonly country?: string;
	readonly language?: string;
}

export interface CompetitorSuggestionRow {
	readonly domain: string;
	readonly distinctKeywords: number;
	readonly totalAppearances: number;
	readonly sampleUrl: string | null;
	readonly bestRank: number;
}

export interface SerpObservationRepository {
	/**
	 * Idempotent upsert: the aggregate's `(projectId, phrase, country,
	 * language, device, observedAt::date)` already collides on the same day,
	 * so the implementation deletes existing rows for that key before
	 * inserting the new top-N. Re-runs within the same day overwrite.
	 */
	save(observation: SerpObservation): Promise<void>;

	/**
	 * Returns the latest snapshot per (project, phrase, country, language,
	 * device) tuple within the rolling window. Filters narrow the scope when
	 * the caller already knows the keyword/locale.
	 */
	listLatestForProject(
		projectId: ProjectId,
		windowDays: number,
		filter?: SerpMapQueryFilter,
	): Promise<readonly SerpObservation[]>;

	/**
	 * Aggregates "external" domains (not in `excludeDomains`) appearing in
	 * top-10 across the project's SERPs in the rolling window. Returned rows
	 * are filtered server-side by `minDistinctKeywords` and ordered by
	 * `(distinctKeywords DESC, totalAppearances DESC)` so the suggestion
	 * panel surfaces the most pervasive competitors first.
	 */
	listCompetitorSuggestions(
		projectId: ProjectId,
		windowDays: number,
		minDistinctKeywords: number,
		excludeDomains: readonly string[],
	): Promise<readonly CompetitorSuggestionRow[]>;
}
