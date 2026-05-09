import type { ProjectManagement, RankTracking } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface QueryRankedKeywordsCommand {
	projectId: string;
	targetDomain: string;
	limit?: number;
	minVolume?: number;
}

export interface RankedKeywordEntryDto {
	keyword: string;
	position: number | null;
	searchVolume: number | null;
	keywordDifficulty: number | null;
	trafficEstimate: number | null;
	cpc: number | null;
	rankingUrl: string | null;
	observedAt: string;
}

export interface RankedKeywordsResponseDto {
	rows: RankedKeywordEntryDto[];
}

/**
 * Issue #127: read-side projection over `ranked_keywords_observations`.
 * Returns the most recent snapshot for the given (project, target domain)
 * pair, optionally filtered by minimum search volume and capped to `limit`.
 *
 * Project existence is validated up-front so the controller doesn't have to
 * 404 separately — a stale URL hit produces the same shape regardless of
 * whether the table is empty or the project never existed.
 */
export class QueryRankedKeywordsUseCase {
	constructor(
		private readonly projects: ProjectManagement.ProjectRepository,
		private readonly observations: RankTracking.RankedKeywordObservationRepository,
	) {}

	async execute(cmd: QueryRankedKeywordsCommand): Promise<RankedKeywordsResponseDto> {
		const project = await this.projects.findById(cmd.projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${cmd.projectId} not found`);
		}
		const obs = await this.observations.listLatestForDomain(project.id, cmd.targetDomain, {
			limit: cmd.limit,
			minVolume: cmd.minVolume,
		});
		const rows: RankedKeywordEntryDto[] = obs.map((o) => ({
			keyword: o.keyword,
			position: o.position,
			searchVolume: o.searchVolume,
			keywordDifficulty: o.keywordDifficulty,
			trafficEstimate: o.trafficEstimate,
			cpc: o.cpc,
			rankingUrl: o.rankingUrl,
			observedAt: o.observedAt.toISOString(),
		}));
		return { rows };
	}
}
