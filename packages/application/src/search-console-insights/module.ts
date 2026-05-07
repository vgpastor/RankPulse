import type { SearchConsoleInsights as SCIDomain, SharedKernel } from '@rankpulse/domain';
import type { Clock, IdGenerator } from '@rankpulse/shared';
import type { ContextModule, ContextRegistrations, SharedDeps } from '../_core/module.js';
import { IngestGscRowsUseCase } from './use-cases/ingest-gsc-rows.use-case.js';
import { LinkGscPropertyUseCase } from './use-cases/link-gsc-property.use-case.js';
import { QueryGscPerformanceUseCase } from './use-cases/query-gsc-performance.use-case.js';

export interface SearchConsoleInsightsDeps {
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: SharedKernel.EventPublisher;
	readonly gscPropertyRepo: SCIDomain.GscPropertyRepository;
	readonly gscObservationRepo: SCIDomain.GscPerformanceObservationRepository;
}

export const searchConsoleInsightsModule: ContextModule = {
	id: 'search-console-insights',
	compose(deps: SharedDeps): ContextRegistrations {
		const d = deps as unknown as SearchConsoleInsightsDeps;
		return {
			useCases: {
				LinkGscProperty: new LinkGscPropertyUseCase(d.gscPropertyRepo, d.clock, d.ids, d.events),
				IngestGscRows: new IngestGscRowsUseCase(
					d.gscPropertyRepo,
					d.gscObservationRepo,
					d.ids,
					d.events,
					d.clock,
				),
				QueryGscPerformance: new QueryGscPerformanceUseCase(d.gscPropertyRepo, d.gscObservationRepo),
			},
			ingestUseCases: {},
			eventHandlers: [],
			schemaTables: [],
		};
	},
};
