import type { SharedKernel, WebPerformance as WPDomain } from '@rankpulse/domain';
import type { Clock, IdGenerator } from '@rankpulse/shared';
import type { ContextModule, ContextRegistrations, SharedDeps } from '../_core/module.js';
import { QueryPageSpeedHistoryUseCase } from './use-cases/query-page-speed-history.use-case.js';
import { TrackPageUseCase } from './use-cases/track-page.use-case.js';
import { UntrackPageUseCase } from './use-cases/untrack-page.use-case.js';

export interface WebPerformanceDeps {
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: SharedKernel.EventPublisher;
	readonly trackedPageRepo: WPDomain.TrackedPageRepository;
	readonly pageSpeedSnapshotRepo: WPDomain.PageSpeedSnapshotRepository;
}

export const webPerformanceModule: ContextModule = {
	id: 'web-performance',
	compose(deps: SharedDeps): ContextRegistrations {
		const d = deps as unknown as WebPerformanceDeps;
		return {
			useCases: {
				TrackPage: new TrackPageUseCase(d.trackedPageRepo, d.clock, d.ids, d.events),
				UntrackPage: new UntrackPageUseCase(d.trackedPageRepo),
				QueryPageSpeedHistory: new QueryPageSpeedHistoryUseCase(d.trackedPageRepo, d.pageSpeedSnapshotRepo),
			},
			ingestUseCases: {},
			eventHandlers: [],
			schemaTables: [],
		};
	},
};
