import type {
	ProjectManagement as PMDomain,
	RankTracking as RTDomain,
	SharedKernel,
} from '@rankpulse/domain';
import type { Clock, IdGenerator } from '@rankpulse/shared';
import type { ContextModule, ContextRegistrations, SharedDeps } from '../_core/module.js';
import { QueryRankingHistoryUseCase } from './use-cases/query-ranking-history.use-case.js';
import { RecordRankingObservationUseCase } from './use-cases/record-ranking-observation.use-case.js';
import { StartTrackingKeywordUseCase } from './use-cases/start-tracking-keyword.use-case.js';

export interface RankTrackingDeps {
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: SharedKernel.EventPublisher;
	readonly trackedKeywordRepo: RTDomain.TrackedKeywordRepository;
	readonly observationRepo: RTDomain.RankingObservationRepository;
	readonly projectRepo: PMDomain.ProjectRepository;
}

export const rankTrackingModule: ContextModule = {
	id: 'rank-tracking',
	compose(deps: SharedDeps): ContextRegistrations {
		const d = deps as unknown as RankTrackingDeps;
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
			},
			ingestUseCases: {},
			eventHandlers: [],
			schemaTables: [],
		};
	},
};
