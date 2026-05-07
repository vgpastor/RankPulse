import type { AiSearchInsights as AISIDomain, SharedKernel } from '@rankpulse/domain';
import type { Clock, IdGenerator } from '@rankpulse/shared';
import type { ContextModule, ContextRegistrations, SharedDeps } from '../_core/module.js';
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
}

export const aiSearchInsightsModule: ContextModule = {
	id: 'ai-search-insights',
	compose(deps: SharedDeps): ContextRegistrations {
		const d = deps as unknown as AiSearchInsightsDeps;
		return {
			useCases: {
				RegisterBrandPrompt: new RegisterBrandPromptUseCase(d.brandPromptRepo, d.clock, d.ids, d.events),
				PauseBrandPrompt: new PauseBrandPromptUseCase(d.brandPromptRepo, d.clock, d.events),
				ResumeBrandPrompt: new ResumeBrandPromptUseCase(d.brandPromptRepo, d.clock, d.events),
				DeleteBrandPrompt: new DeleteBrandPromptUseCase(d.brandPromptRepo),
				ListBrandPrompts: new ListBrandPromptsUseCase(d.brandPromptRepo),
				RecordLlmAnswer: new RecordLlmAnswerUseCase(
					d.brandPromptRepo,
					d.llmAnswerRepo,
					d.brandWatchlistResolver,
					d.mentionExtractor,
					d.clock,
					d.ids,
					d.events,
				),
				QueryLlmAnswers: new QueryLlmAnswersUseCase(d.llmAnswerRepo),
				QueryAiSearchPresence: new QueryAiSearchPresenceUseCase(d.llmAnswerReadModel),
				QueryAiSearchSov: new QueryAiSearchSovUseCase(d.llmAnswerReadModel),
				QueryAiSearchCitations: new QueryAiSearchCitationsUseCase(d.llmAnswerReadModel),
				QueryPromptSovDaily: new QueryPromptSovDailyUseCase(d.llmAnswerReadModel),
				QueryCompetitiveMatrix: new QueryCompetitiveMatrixUseCase(d.llmAnswerReadModel),
				QueryAiSearchAlerts: new QueryAiSearchAlertsUseCase(d.llmAnswerReadModel),
			},
			ingestUseCases: {},
			eventHandlers: [],
			schemaTables: [],
		};
	},
};
