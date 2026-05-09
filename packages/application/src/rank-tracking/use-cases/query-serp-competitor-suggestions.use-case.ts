import type { ProjectManagement, RankTracking } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface QuerySerpCompetitorSuggestionsCommand {
	projectId: string;
	minDistinctKeywords?: number;
	windowDays?: number;
}

export interface SerpCompetitorSuggestionDto {
	domain: string;
	distinctKeywords: number;
	totalAppearances: number;
	bestRank: number;
	sampleUrl: string | null;
}

export interface SerpCompetitorSuggestionsResponse {
	suggestions: SerpCompetitorSuggestionDto[];
}

const DEFAULT_MIN_DISTINCT_KEYWORDS = 2;
const DEFAULT_WINDOW_DAYS = 7;

const normalizeDomain = (raw: string): string =>
	raw
		.trim()
		.toLowerCase()
		.replace(/^www\./, '');

/**
 * Surfaces external domains (not own, not registered competitors) that
 * appear in the project's SERP top-10 ≥ `minDistinctKeywords` times within
 * the rolling window. Powers the "Sin registrar (top 10)" suggestion panel.
 *
 * Computed dynamically from the `serp_observations` hypertable so adding a
 * new competitor or domain immediately removes it from the suggestions list
 * — the project-management `competitor_suggestions` table records the same
 * signal but pre-aggregated at ingest time, which doesn't update when the
 * project's tracked/competitor sets change.
 */
export class QuerySerpCompetitorSuggestionsUseCase {
	constructor(
		private readonly projects: ProjectManagement.ProjectRepository,
		private readonly competitors: ProjectManagement.CompetitorRepository,
		private readonly serpObservations: RankTracking.SerpObservationRepository,
	) {}

	async execute(cmd: QuerySerpCompetitorSuggestionsCommand): Promise<SerpCompetitorSuggestionsResponse> {
		const projectId = cmd.projectId as ProjectManagement.ProjectId;
		const project = await this.projects.findById(projectId);
		if (!project) {
			throw new NotFoundError(`Project ${cmd.projectId} not found`);
		}
		const competitors = await this.competitors.listForProject(projectId);
		const exclude = new Set<string>();
		for (const d of project.domains) exclude.add(normalizeDomain(d.domain.value));
		for (const c of competitors) exclude.add(normalizeDomain(c.domain.value));

		const minDistinct = Math.max(1, cmd.minDistinctKeywords ?? DEFAULT_MIN_DISTINCT_KEYWORDS);
		const windowDays = cmd.windowDays ?? DEFAULT_WINDOW_DAYS;
		const rows = await this.serpObservations.listCompetitorSuggestions(projectId, windowDays, minDistinct, [
			...exclude,
		]);
		return {
			suggestions: rows.map((r) => ({
				domain: r.domain,
				distinctKeywords: r.distinctKeywords,
				totalAppearances: r.totalAppearances,
				bestRank: r.bestRank,
				sampleUrl: r.sampleUrl,
			})),
		};
	}
}
