import type { AiSearchInsights, ProjectManagement } from '@rankpulse/domain';
import { normaliseDashboardWindow } from './window-guards.js';

export interface QueryCompetitiveMatrixQuery {
	projectId: string;
	from?: Date;
	to?: Date;
}

export interface CompetitiveMatrixCellDto {
	aiProvider: AiSearchInsights.AiProviderName;
	country: string;
	language: string;
	brand: string;
	isOwnBrand: boolean;
	totalAnswers: number;
	answersWithMention: number;
	mentionRate: number;
	avgPosition: number | null;
}

const DEFAULT_WINDOW_DAYS = 30;

/**
 * Sub-issue #64 of #27 — competitive matrix read view. Returns a flat list
 * of `(aiProvider × country × language × brand)` cells. The UI pivots
 * client-side: rows = brand, columns = (provider, locale), cell value =
 * `mentionRate`. Cells where a brand has zero mentions are not present in
 * the response — the UI fills the gap with a 0% cell so the heatmap stays
 * dense.
 */
export class QueryCompetitiveMatrixUseCase {
	constructor(private readonly readModel: AiSearchInsights.LlmAnswerReadModel) {}

	async execute(query: QueryCompetitiveMatrixQuery): Promise<readonly CompetitiveMatrixCellDto[]> {
		const { from, to } = normaliseDashboardWindow(query, DEFAULT_WINDOW_DAYS);
		const cells = await this.readModel.competitiveMatrixForProject(
			query.projectId as ProjectManagement.ProjectId,
			{ from, to },
		);
		return cells.map((c) => ({
			aiProvider: c.aiProvider,
			country: c.country,
			language: c.language,
			brand: c.brand,
			isOwnBrand: c.isOwnBrand,
			totalAnswers: c.totalAnswers,
			answersWithMention: c.answersWithMention,
			mentionRate: c.mentionRate,
			avgPosition: c.avgPosition,
		}));
	}
}
