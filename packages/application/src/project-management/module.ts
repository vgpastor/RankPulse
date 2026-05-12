import type { ProjectManagement as PMDomain, SharedKernel } from '@rankpulse/domain';
import type { Clock, IdGenerator } from '@rankpulse/shared';
import type { ContextModule, ContextRegistrations, IngestUseCase, SharedDeps } from '../_core/module.js';
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
import { QueryCompetitorActivityUseCase } from './use-cases/query-competitor-activity.use-case.js';
import { RemoveCompetitorUseCase } from './use-cases/remove-competitor.use-case.js';
import { RecordCompetitorBacklinksProfileUseCase } from './use-cases/record-competitor-backlinks-profile.use-case.js';
import { RecordCompetitorWaybackSnapshotUseCase } from './use-cases/record-competitor-wayback-snapshot.use-case.js';

export interface ProjectManagementDeps {
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: SharedKernel.EventPublisher;
	readonly projectRepo: PMDomain.ProjectRepository;
	readonly portfolioRepo: PMDomain.PortfolioRepository;
	readonly keywordListRepo: PMDomain.KeywordListRepository;
	readonly competitorRepo: PMDomain.CompetitorRepository;
	readonly competitorSuggestionRepo: PMDomain.CompetitorSuggestionRepository;
	readonly competitorActivityRepo: PMDomain.CompetitorActivityObservationRepository;
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
		const recordWaybackSnapshot = new RecordCompetitorWaybackSnapshotUseCase(
			d.competitorRepo,
			d.competitorActivityRepo,
			d.clock,
			d.ids,
		);
		const recordBacklinksProfile = new RecordCompetitorBacklinksProfileUseCase(
			d.competitorRepo,
			d.competitorActivityRepo,
			d.clock,
			d.ids,
		);
		// Issue #117 Sprint 2 — Wayback CDX + DataForSEO Backlinks ingest
		// adapters. Each provider's ACL produces ONE summary row per fetch
		// (`rows[0]` is `WaybackSnapshotSummary` / `BacklinksProfileSummary`).
		const waybackIngest: IngestUseCase = {
			async execute({ rawPayloadId, rows, systemParams }) {
				const summary = rows[0] as
					| {
							snapshotCount: number;
							latestSnapshotAt: string | null;
							earliestSnapshotAt: string | null;
					  }
					| undefined;
				if (!summary) return;
				const competitorId = systemParams.competitorId as string | undefined;
				if (!competitorId) return;
				await recordWaybackSnapshot.execute({
					competitorId,
					rawPayloadId,
					summary: {
						snapshotCount: summary.snapshotCount,
						latestSnapshotAt: summary.latestSnapshotAt,
						earliestSnapshotAt: summary.earliestSnapshotAt,
					},
				});
			},
		};
		const backlinksIngest: IngestUseCase = {
			async execute({ rawPayloadId, rows, systemParams }) {
				const summary = rows[0] as
					| {
							totalBacklinks: number;
							referringDomains: number;
							referringMainDomains: number;
							referringPages: number;
							brokenBacklinks: number;
							spamScore: number | null;
							rank: number | null;
					  }
					| undefined;
				if (!summary) return;
				const competitorId = systemParams.competitorId as string | undefined;
				if (!competitorId) return;
				await recordBacklinksProfile.execute({
					competitorId,
					rawPayloadId,
					summary,
				});
			},
		};

		return {
			useCases: {
				CreateProject: new CreateProjectUseCase(d.projectRepo, d.clock, d.ids, d.events),
				AddDomainToProject: new AddDomainToProjectUseCase(d.projectRepo, d.clock, d.events),
				AddProjectLocation: new AddProjectLocationUseCase(d.projectRepo, d.clock, d.events),
				AddCompetitor: new AddCompetitorUseCase(d.projectRepo, d.competitorRepo, d.clock, d.ids, d.events),
				RemoveCompetitor: new RemoveCompetitorUseCase(d.projectRepo, d.competitorRepo),
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
				RecordCompetitorWaybackSnapshot: recordWaybackSnapshot,
				RecordCompetitorBacklinksProfile: recordBacklinksProfile,
				QueryCompetitorActivity: new QueryCompetitorActivityUseCase(
					d.projectRepo,
					d.competitorRepo,
					d.competitorActivityRepo,
				),
			},
			ingestUseCases: {
				'project-management:record-competitor-wayback-snapshot': waybackIngest,
				'project-management:record-competitor-backlinks-profile': backlinksIngest,
			},
			eventHandlers: [],
			schemaTables: d.projectManagementSchemaTables,
		};
	},
};
