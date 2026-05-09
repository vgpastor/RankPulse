import type {
	ProjectManagement as PMDomain,
	RankTracking as RTDomain,
	SharedKernel,
} from '@rankpulse/domain';
import type { Clock, IdGenerator } from '@rankpulse/shared';
import type { ContextModule, ContextRegistrations, SharedDeps } from '../_core/module.js';
import { IngestRankedKeywordsUseCase } from './use-cases/ingest-ranked-keywords.use-case.js';
import { QueryRankedKeywordsUseCase } from './use-cases/query-ranked-keywords.use-case.js';
import { QueryRankingHistoryUseCase } from './use-cases/query-ranking-history.use-case.js';
import { QuerySerpCompetitorSuggestionsUseCase } from './use-cases/query-serp-competitor-suggestions.use-case.js';
import { QuerySerpMapUseCase } from './use-cases/query-serp-map.use-case.js';
import { RecordRankingObservationUseCase } from './use-cases/record-ranking-observation.use-case.js';
import { RecordSerpObservationUseCase } from './use-cases/record-serp-observation.use-case.js';
import { StartTrackingKeywordUseCase } from './use-cases/start-tracking-keyword.use-case.js';

export interface RankTrackingDeps {
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: SharedKernel.EventPublisher;
	readonly trackedKeywordRepo: RTDomain.TrackedKeywordRepository;
	readonly observationRepo: RTDomain.RankingObservationRepository;
	readonly serpObservationRepo: RTDomain.SerpObservationRepository;
	readonly rankedKeywordObservationRepo: RTDomain.RankedKeywordObservationRepository;
	readonly projectRepo: PMDomain.ProjectRepository;
	readonly competitorRepo: PMDomain.CompetitorRepository;
	readonly rankTrackingSchemaTables: readonly unknown[];
}

export const rankTrackingModule: ContextModule = {
	id: 'rank-tracking',
	compose(deps: SharedDeps): ContextRegistrations {
		const d = deps as unknown as RankTrackingDeps;
		const ingestRankedKeywords = new IngestRankedKeywordsUseCase(
			d.projectRepo,
			d.rankedKeywordObservationRepo,
			d.ids,
		);
		return {
			useCases: {
				StartTrackingKeyword: new StartTrackingKeywordUseCase(d.trackedKeywordRepo, d.clock, d.ids, d.events),
				RecordRankingObservation: new RecordRankingObservationUseCase(
					d.trackedKeywordRepo,
					d.observationRepo,
					d.clock,
					d.ids,
					d.events,
				),
				QueryRankingHistory: new QueryRankingHistoryUseCase(d.trackedKeywordRepo, d.observationRepo),
				RecordSerpObservation: new RecordSerpObservationUseCase(d.serpObservationRepo, d.clock, d.ids),
				QuerySerpMap: new QuerySerpMapUseCase(d.projectRepo, d.competitorRepo, d.serpObservationRepo),
				QuerySerpCompetitorSuggestions: new QuerySerpCompetitorSuggestionsUseCase(
					d.projectRepo,
					d.competitorRepo,
					d.serpObservationRepo,
				),
				IngestRankedKeywords: ingestRankedKeywords,
				QueryRankedKeywords: new QueryRankedKeywordsUseCase(d.projectRepo, d.rankedKeywordObservationRepo),
			},
			ingestUseCases: {
				// Issue #127: typed ingest path. The router's generic
				// `{rawPayloadId, rows, systemParams}` envelope carries the
				// `targetDomain` (validated by the manifest's ACL) plus the
				// projectId stamped at scheduling time. `country`/`language`
				// fall through from `endpointParams` (DataForSEO Labs scopes
				// the snapshot to a single locale per request).
				'rank-tracking:ingest-ranked-keywords': {
					async execute({ rawPayloadId, rows, systemParams }) {
						await ingestRankedKeywords.execute({
							projectId: systemParams.projectId as string,
							targetDomain: systemParams.targetDomain as string,
							country: (systemParams.country as string | undefined) ?? '',
							language: (systemParams.language as string | undefined) ?? '',
							rawPayloadId,
							rows: rows as Parameters<typeof ingestRankedKeywords.execute>[0]['rows'],
						});
					},
				},
			},
			eventHandlers: [],
			schemaTables: d.rankTrackingSchemaTables,
		};
	},
};
