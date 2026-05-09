import type { CompetitorIntelligence, ProjectManagement } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface QueryKeywordGapsCommand {
	projectId: string;
	ourDomain: string;
	competitorDomain: string;
	limit?: number;
	minVolume?: number;
}

export interface KeywordGapEntryDto {
	keyword: string;
	ourPosition: number | null;
	theirPosition: number | null;
	searchVolume: number | null;
	cpc: number | null;
	keywordDifficulty: number | null;
	roiScore: number | null;
	observedAt: string;
}

export interface KeywordGapsResponseDto {
	rows: KeywordGapEntryDto[];
}

/**
 * Issue #128: read-side projection over `competitor_keyword_gaps`. Returns the
 * latest snapshot for the (project, ourDomain, competitorDomain) tuple,
 * already ranked by ROI score `(searchVolume × cpc) / (kd + 1)` DESC at the
 * repo layer. Project existence is validated up-front so the controller
 * doesn't need a separate 404 check.
 */
export class QueryKeywordGapsUseCase {
	constructor(
		private readonly projects: ProjectManagement.ProjectRepository,
		private readonly gaps: CompetitorIntelligence.CompetitorKeywordGapRepository,
	) {}

	async execute(cmd: QueryKeywordGapsCommand): Promise<KeywordGapsResponseDto> {
		const project = await this.projects.findById(cmd.projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${cmd.projectId} not found`);
		}
		const gaps = await this.gaps.listLatestForCompetitor(project.id, cmd.ourDomain, cmd.competitorDomain, {
			limit: cmd.limit,
			minVolume: cmd.minVolume,
		});
		const rows: KeywordGapEntryDto[] = gaps.map((g) => ({
			keyword: g.keyword,
			ourPosition: g.ourPosition,
			theirPosition: g.theirPosition,
			searchVolume: g.searchVolume,
			cpc: g.cpc,
			keywordDifficulty: g.keywordDifficulty,
			roiScore: g.roiScore,
			observedAt: g.observedAt.toISOString(),
		}));
		return { rows };
	}
}
