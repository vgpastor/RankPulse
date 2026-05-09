import type { AiSearchInsights, ProjectManagement } from '@rankpulse/domain';
import { normaliseDashboardWindow } from './window-guards.js';

export interface QueryProjectSovDailyQuery {
	projectId: string;
	from?: Date;
	to?: Date;
}

export interface AiSearchProjectSovDailyPointDto {
	day: string;
	totalAnswers: number;
	answersWithOwnMention: number;
	mentionRate: number;
}

const DEFAULT_WINDOW_DAYS = 28;

/**
 * Project-wide daily own-brand mention rate (issue #117 Sprint 2). Aggregates
 * across every BrandPrompt and capture in the window, returning one point per
 * day. Same shape as `QueryPromptSovDailyUseCase` so the SPA reuses the
 * sparkline renderer.
 */
export class QueryProjectSovDailyUseCase {
	constructor(private readonly readModel: AiSearchInsights.LlmAnswerReadModel) {}

	async execute(query: QueryProjectSovDailyQuery): Promise<readonly AiSearchProjectSovDailyPointDto[]> {
		const { from, to } = normaliseDashboardWindow(query, DEFAULT_WINDOW_DAYS);
		const points = await this.readModel.sovDailyForProject(query.projectId as ProjectManagement.ProjectId, {
			from,
			to,
		});
		return points.map((p) => ({
			day: p.day,
			totalAnswers: p.totalAnswers,
			answersWithOwnMention: p.answersWithOwnMention,
			mentionRate: p.totalAnswers === 0 ? 0 : p.answersWithOwnMention / p.totalAnswers,
		}));
	}
}
