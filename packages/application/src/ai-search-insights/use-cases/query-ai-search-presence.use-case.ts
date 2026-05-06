import type { AiSearchInsights, ProjectManagement } from '@rankpulse/domain';
import { normaliseDashboardWindow } from './window-guards.js';

export interface QueryAiSearchPresenceQuery {
	projectId: string;
	from?: Date;
	to?: Date;
}

export interface AiSearchPresenceDto {
	from: string;
	to: string;
	totalAnswers: number;
	answersWithOwnMention: number;
	mentionRate: number;
	ownCitationCount: number;
	citationRate: number;
	ownAvgPosition: number | null;
	competitorMentionCount: number;
}

const DEFAULT_WINDOW_DAYS = 7;

/**
 * Aggregates the AI Brand Radar headline metrics for the project home card.
 * Default window is 7 days — matches the "this week" framing the dashboard
 * uses; callers can override `from` / `to` if they want a longer view.
 */
export class QueryAiSearchPresenceUseCase {
	constructor(private readonly readModel: AiSearchInsights.LlmAnswerReadModel) {}

	async execute(query: QueryAiSearchPresenceQuery): Promise<AiSearchPresenceDto> {
		const { from, to } = normaliseDashboardWindow(query, DEFAULT_WINDOW_DAYS);
		const summary = await this.readModel.presenceForProject(query.projectId as ProjectManagement.ProjectId, {
			from,
			to,
		});
		const mentionRate = summary.totalAnswers === 0 ? 0 : summary.answersWithOwnMention / summary.totalAnswers;
		const citationRate = summary.totalAnswers === 0 ? 0 : summary.ownCitationCount / summary.totalAnswers;
		return {
			from: from.toISOString(),
			to: to.toISOString(),
			totalAnswers: summary.totalAnswers,
			answersWithOwnMention: summary.answersWithOwnMention,
			mentionRate,
			ownCitationCount: summary.ownCitationCount,
			citationRate,
			ownAvgPosition: summary.ownAvgPosition,
			competitorMentionCount: summary.competitorMentionCount,
		};
	}
}
