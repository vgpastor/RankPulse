import type {
	ProjectManagement as PMDomain,
	SearchConsoleInsights as SCIDomain,
	SharedKernel,
} from '@rankpulse/domain';
import type { Clock, IdGenerator } from '@rankpulse/shared';
import { buildAutoScheduleHandlers } from '../_core/auto-schedule.js';
import type { ContextModule, ContextRegistrations, SharedDeps } from '../_core/module.js';
import { searchConsoleInsightsAutoScheduleConfigs } from './event-handlers/auto-schedule.config.js';
import { IngestGscRowsUseCase } from './use-cases/ingest-gsc-rows.use-case.js';
import { LinkGscPropertyUseCase } from './use-cases/link-gsc-property.use-case.js';
import { QueryBrandDecayUseCase } from './use-cases/query-brand-decay.use-case.js';
import { QueryClicksForecastUseCase } from './use-cases/query-clicks-forecast.use-case.js';
import { QueryCtrAnomaliesUseCase } from './use-cases/query-ctr-anomalies.use-case.js';
import { QueryGscPerformanceUseCase } from './use-cases/query-gsc-performance.use-case.js';
import { QueryLostOpportunityUseCase } from './use-cases/query-lost-opportunity.use-case.js';
import { QueryQuickWinRoiUseCase } from './use-cases/query-quick-win-roi.use-case.js';
import { UnlinkGscPropertyUseCase } from './use-cases/unlink-gsc-property.use-case.js';

export interface SearchConsoleInsightsDeps {
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: SharedKernel.EventPublisher;
	readonly gscPropertyRepo: SCIDomain.GscPropertyRepository;
	readonly gscObservationRepo: SCIDomain.GscPerformanceObservationRepository;
	readonly gscCockpitReadModel: SCIDomain.GscCockpitReadModel;
	readonly projectRepo: PMDomain.ProjectRepository;
	readonly searchConsoleInsightsSchemaTables: readonly unknown[];
}

export const searchConsoleInsightsModule: ContextModule = {
	id: 'search-console-insights',
	compose(deps: SharedDeps): ContextRegistrations {
		const d = deps as unknown as SearchConsoleInsightsDeps;
		const ingestGscRows = new IngestGscRowsUseCase(
			d.gscPropertyRepo,
			d.gscObservationRepo,
			d.ids,
			d.events,
			d.clock,
		);
		return {
			useCases: {
				LinkGscProperty: new LinkGscPropertyUseCase(d.gscPropertyRepo, d.clock, d.ids, d.events),
				UnlinkGscProperty: new UnlinkGscPropertyUseCase(d.gscPropertyRepo, d.clock),
				IngestGscRows: ingestGscRows,
				QueryGscPerformance: new QueryGscPerformanceUseCase(d.gscPropertyRepo, d.gscObservationRepo),
				QueryCtrAnomalies: new QueryCtrAnomaliesUseCase(d.projectRepo, d.gscCockpitReadModel),
				QueryLostOpportunity: new QueryLostOpportunityUseCase(d.projectRepo, d.gscCockpitReadModel),
				QueryQuickWinRoi: new QueryQuickWinRoiUseCase(d.projectRepo, d.gscCockpitReadModel),
				QueryBrandDecay: new QueryBrandDecayUseCase(d.projectRepo, d.gscCockpitReadModel),
				QueryClicksForecast: new QueryClicksForecastUseCase(d.projectRepo, d.gscCockpitReadModel),
			},
			ingestUseCases: {
				// Manifest key: see provider-google-search-console manifest.
				// Adapter bridges the generic `{rawPayloadId, rows, systemParams}`
				// shape that the IngestRouter pumps in from the worker into the
				// use case's `IngestGscRowsCommand`.
				'search-console-insights:ingest-gsc-rows': {
					async execute({ rawPayloadId, rows, systemParams }) {
						await ingestGscRows.execute({
							gscPropertyId: systemParams.gscPropertyId as string,
							rawPayloadId,
							rows: rows as Parameters<typeof ingestGscRows.execute>[0]['rows'],
						});
					},
				},
			},
			eventHandlers: buildAutoScheduleHandlers(deps, searchConsoleInsightsAutoScheduleConfigs),
			schemaTables: d.searchConsoleInsightsSchemaTables,
		};
	},
};
