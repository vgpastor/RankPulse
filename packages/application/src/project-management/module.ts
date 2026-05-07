import type { ProjectManagement as PMDomain, SharedKernel } from '@rankpulse/domain';
import type { Clock, IdGenerator } from '@rankpulse/shared';
import type { ContextModule, ContextRegistrations, SharedDeps } from '../_core/module.js';
import { AddCompetitorUseCase } from './use-cases/add-competitor.use-case.js';
import { AddDomainToProjectUseCase } from './use-cases/add-domain-to-project.use-case.js';
import { AddProjectLocationUseCase } from './use-cases/change-project-locations.use-case.js';
import {
	DismissCompetitorSuggestionUseCase,
	ListCompetitorSuggestionsUseCase,
	PromoteCompetitorSuggestionUseCase,
} from './use-cases/competitor-suggestions.use-cases.js';
import { CreateProjectUseCase } from './use-cases/create-project.use-case.js';
import { ImportKeywordsUseCase } from './use-cases/import-keywords.use-case.js';
import {
	CreatePortfolioUseCase,
	DeletePortfolioUseCase,
	GetPortfolioUseCase,
	ListPortfoliosUseCase,
	RenamePortfolioUseCase,
} from './use-cases/manage-portfolios.use-cases.js';

export interface ProjectManagementDeps {
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: SharedKernel.EventPublisher;
	readonly projectRepo: PMDomain.ProjectRepository;
	readonly portfolioRepo: PMDomain.PortfolioRepository;
	readonly keywordListRepo: PMDomain.KeywordListRepository;
	readonly competitorRepo: PMDomain.CompetitorRepository;
	readonly competitorSuggestionRepo: PMDomain.CompetitorSuggestionRepository;
	/**
	 * BACKLOG #18: project-management's `ListCompetitorSuggestions` needs
	 * the project's tracked-keyword count to evaluate the eligibility
	 * ratio. Rather than coupling project-management to the rank-tracking
	 * aggregate, we accept a tiny lambda over the tracked-keyword repo —
	 * composition root provides the actual `trackedKeywordRepo.countForProject`.
	 */
	readonly trackedKeywordCountForProject: (projectId: string) => Promise<number>;
	readonly projectManagementSchemaTables: readonly unknown[];
}

export const projectManagementModule: ContextModule = {
	id: 'project-management',
	compose(deps: SharedDeps): ContextRegistrations {
		const d = deps as unknown as ProjectManagementDeps;
		return {
			useCases: {
				CreateProject: new CreateProjectUseCase(d.projectRepo, d.clock, d.ids, d.events),
				AddDomainToProject: new AddDomainToProjectUseCase(d.projectRepo, d.clock, d.events),
				AddProjectLocation: new AddProjectLocationUseCase(d.projectRepo, d.clock, d.events),
				AddCompetitor: new AddCompetitorUseCase(d.projectRepo, d.competitorRepo, d.clock, d.ids, d.events),
				ImportKeywords: new ImportKeywordsUseCase(d.projectRepo, d.keywordListRepo, d.clock, d.ids, d.events),
				CreatePortfolio: new CreatePortfolioUseCase(d.portfolioRepo, d.clock, d.ids, d.events),
				ListPortfolios: new ListPortfoliosUseCase(d.portfolioRepo),
				GetPortfolio: new GetPortfolioUseCase(d.portfolioRepo),
				RenamePortfolio: new RenamePortfolioUseCase(d.portfolioRepo),
				DeletePortfolio: new DeletePortfolioUseCase(d.portfolioRepo),
				ListCompetitorSuggestions: new ListCompetitorSuggestionsUseCase(
					d.competitorSuggestionRepo,
					d.trackedKeywordCountForProject,
				),
				PromoteCompetitorSuggestion: new PromoteCompetitorSuggestionUseCase(
					d.competitorSuggestionRepo,
					d.competitorRepo,
					d.clock,
					d.ids,
					d.events,
				),
				DismissCompetitorSuggestion: new DismissCompetitorSuggestionUseCase(
					d.competitorSuggestionRepo,
					d.clock,
				),
			},
			ingestUseCases: {},
			eventHandlers: [],
			schemaTables: d.projectManagementSchemaTables,
		};
	},
};
