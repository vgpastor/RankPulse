import type { AiSearchInsights, ProjectManagement } from '@rankpulse/domain';
import { normaliseDashboardWindow } from './window-guards.js';

export interface QueryAiSearchSovQuery {
	projectId: string;
	from?: Date;
	to?: Date;
}

export interface AiSearchSovDto {
	aiProvider: AiSearchInsights.AiProviderName;
	country: string;
	language: string;
	brand: string;
	isOwnBrand: boolean;
	totalAnswers: number;
	answersWithMention: number;
	mentionRate: number;
	avgPosition: number | null;
	citationCount: number;
}

const DEFAULT_WINDOW_DAYS = 30;

/**
 * Share-of-voice grid for the dashboards. One row per (provider, locale,
 * brand) combination — the UI pivots client-side to render the matrix.
 */
export class QueryAiSearchSovUseCase {
	constructor(private readonly readModel: AiSearchInsights.LlmAnswerReadModel) {}

	async execute(query: QueryAiSearchSovQuery): Promise<readonly AiSearchSovDto[]> {
		const { from, to } = normaliseDashboardWindow(query, DEFAULT_WINDOW_DAYS);
		const rows = await this.readModel.sovForProject(query.projectId as ProjectManagement.ProjectId, {
			from,
			to,
		});
		return rows.map((row) => ({
			aiProvider: row.aiProvider,
			country: row.country,
			language: row.language,
			brand: row.brand,
			isOwnBrand: row.isOwnBrand,
			totalAnswers: row.totalAnswers,
			answersWithMention: row.answersWithMention,
			mentionRate: row.totalAnswers === 0 ? 0 : row.answersWithMention / row.totalAnswers,
			avgPosition: row.avgPosition,
			citationCount: row.citationCount,
		}));
	}
}
