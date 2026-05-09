import type { AiSearchInsights as AISIDomain, SharedKernel } from '@rankpulse/domain';
import type { Clock, IdGenerator } from '@rankpulse/shared';
import { buildAutoScheduleHandlers } from '../_core/auto-schedule.js';
import type { ContextModule, ContextRegistrations, SharedDeps } from '../_core/module.js';
import { aiSearchInsightsAutoScheduleConfigs } from './event-handlers/auto-schedule.config.js';
import { DeleteBrandPromptUseCase } from './use-cases/delete-brand-prompt.use-case.js';
import { ListBrandPromptsUseCase } from './use-cases/list-brand-prompts.use-case.js';
import {
	PauseBrandPromptUseCase,
	ResumeBrandPromptUseCase,
} from './use-cases/pause-brand-prompt.use-case.js';
import { QueryAiSearchAlertsUseCase } from './use-cases/query-ai-search-alerts.use-case.js';
import { QueryAiSearchCitationsUseCase } from './use-cases/query-ai-search-citations.use-case.js';
import { QueryAiSearchPresenceUseCase } from './use-cases/query-ai-search-presence.use-case.js';
import { QueryAiSearchSovUseCase } from './use-cases/query-ai-search-sov.use-case.js';
import { QueryCompetitiveMatrixUseCase } from './use-cases/query-competitive-matrix.use-case.js';
import { QueryLlmAnswersUseCase } from './use-cases/query-llm-answers.use-case.js';
import { QueryProjectSovDailyUseCase } from './use-cases/query-project-sov-daily.use-case.js';
import { QueryPromptSovDailyUseCase } from './use-cases/query-prompt-sov-daily.use-case.js';
import { RecordLlmAnswerUseCase } from './use-cases/record-llm-answer.use-case.js';
import { RegisterBrandPromptUseCase } from './use-cases/register-brand-prompt.use-case.js';

export interface AiSearchInsightsDeps {
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: SharedKernel.EventPublisher;
	readonly brandPromptRepo: AISIDomain.BrandPromptRepository;
	readonly llmAnswerRepo: AISIDomain.LlmAnswerRepository;
	readonly llmAnswerReadModel: AISIDomain.LlmAnswerReadModel;
	readonly brandWatchlistResolver: AISIDomain.BrandWatchlistResolver;
	readonly mentionExtractor: AISIDomain.MentionExtractor;
	readonly aiSearchInsightsSchemaTables: readonly unknown[];
}

export const aiSearchInsightsModule: ContextModule = {
	id: 'ai-search-insights',
	compose(deps: SharedDeps): ContextRegistrations {
		const d = deps as unknown as AiSearchInsightsDeps;
		const recordLlmAnswer = new RecordLlmAnswerUseCase(
			d.brandPromptRepo,
			d.llmAnswerRepo,
			d.brandWatchlistResolver,
			d.mentionExtractor,
			d.clock,
			d.ids,
			d.events,
		);
		return {
			useCases: {
				RegisterBrandPrompt: new RegisterBrandPromptUseCase(d.brandPromptRepo, d.clock, d.ids, d.events),
				PauseBrandPrompt: new PauseBrandPromptUseCase(d.brandPromptRepo, d.clock, d.events),
				ResumeBrandPrompt: new ResumeBrandPromptUseCase(d.brandPromptRepo, d.clock, d.events),
				DeleteBrandPrompt: new DeleteBrandPromptUseCase(d.brandPromptRepo),
				ListBrandPrompts: new ListBrandPromptsUseCase(d.brandPromptRepo),
				RecordLlmAnswer: recordLlmAnswer,
				QueryLlmAnswers: new QueryLlmAnswersUseCase(d.llmAnswerRepo),
				QueryAiSearchPresence: new QueryAiSearchPresenceUseCase(d.llmAnswerReadModel),
				QueryAiSearchSov: new QueryAiSearchSovUseCase(d.llmAnswerReadModel),
				QueryAiSearchCitations: new QueryAiSearchCitationsUseCase(d.llmAnswerReadModel),
				QueryPromptSovDaily: new QueryPromptSovDailyUseCase(d.llmAnswerReadModel),
				QueryProjectSovDaily: new QueryProjectSovDailyUseCase(d.llmAnswerReadModel),
				QueryCompetitiveMatrix: new QueryCompetitiveMatrixUseCase(d.llmAnswerReadModel),
				QueryAiSearchAlerts: new QueryAiSearchAlertsUseCase(d.llmAnswerReadModel),
			},
			ingestUseCases: {
				// All four LLM-search providers (openai/anthropic/perplexity/google-ai-studio)
				// share the same useCaseKey — the ACL produces a `[response]` row and the
				// adapter writes the captured answer with the brandPromptId + locale resolved
				// from systemParams (set by the auto-schedule's dynamicSchedules callback).
				// Skips the call when systemParams is incomplete so a dispatch from a
				// stale schedule (without the locale fields) does not abort the run.
				'ai-search-insights:record-llm-answer': {
					async execute({ rawPayloadId, rows, systemParams }) {
						const answer = rows[0] as Parameters<typeof recordLlmAnswer.execute>[0]['response'] | undefined;
						if (!answer) return;
						const brandPromptId = systemParams.brandPromptId as string | undefined;
						const country = systemParams.country as string | undefined;
						const language = systemParams.language as string | undefined;
						if (!brandPromptId || !country || !language) {
							return;
						}
						await recordLlmAnswer.execute({
							brandPromptId,
							country,
							language,
							rawPayloadId,
							response: answer,
						});
					},
				},
			},
			eventHandlers: buildAutoScheduleHandlers(deps, aiSearchInsightsAutoScheduleConfigs),
			schemaTables: d.aiSearchInsightsSchemaTables,
		};
	},
};
