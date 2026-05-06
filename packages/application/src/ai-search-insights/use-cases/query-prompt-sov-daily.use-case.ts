import type { AiSearchInsights } from '@rankpulse/domain';
import { normaliseDashboardWindow } from './window-guards.js';

export interface QueryPromptSovDailyQuery {
	brandPromptId: string;
	from?: Date;
	to?: Date;
}

export interface AiSearchSovDailyPointDto {
	day: string;
	totalAnswers: number;
	answersWithOwnMention: number;
	mentionRate: number;
}

const DEFAULT_WINDOW_DAYS = 30;

/**
 * Daily SoV curve for a single BrandPrompt — feeds the sparkline in the
 * "Prompt watcher" table. Each point aggregates across every (provider ×
 * locale) capture for that day.
 */
export class QueryPromptSovDailyUseCase {
	constructor(private readonly readModel: AiSearchInsights.LlmAnswerReadModel) {}

	async execute(query: QueryPromptSovDailyQuery): Promise<readonly AiSearchSovDailyPointDto[]> {
		const { from, to } = normaliseDashboardWindow(query, DEFAULT_WINDOW_DAYS);
		const points = await this.readModel.sovDailyForPrompt(
			query.brandPromptId as AiSearchInsights.BrandPromptId,
			{ from, to },
		);
		return points.map((p) => ({
			day: p.day,
			totalAnswers: p.totalAnswers,
			answersWithOwnMention: p.answersWithOwnMention,
			mentionRate: p.totalAnswers === 0 ? 0 : p.answersWithOwnMention / p.totalAnswers,
		}));
	}
}
