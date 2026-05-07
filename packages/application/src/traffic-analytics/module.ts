import type { SharedKernel, TrafficAnalytics as TADomain } from '@rankpulse/domain';
import type { Clock, IdGenerator } from '@rankpulse/shared';
import { buildAutoScheduleHandlers } from '../_core/auto-schedule.js';
import type { ContextModule, ContextRegistrations, SharedDeps } from '../_core/module.js';
import { trafficAnalyticsAutoScheduleConfigs } from './event-handlers/auto-schedule.config.js';
import { IngestGa4RowsUseCase } from './use-cases/ingest-ga4-rows.use-case.js';
import { LinkGa4PropertyUseCase } from './use-cases/link-ga4-property.use-case.js';
import { QueryGa4MetricsUseCase } from './use-cases/query-ga4-metrics.use-case.js';
import { UnlinkGa4PropertyUseCase } from './use-cases/unlink-ga4-property.use-case.js';

export interface TrafficAnalyticsDeps {
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: SharedKernel.EventPublisher;
	readonly ga4PropertyRepo: TADomain.Ga4PropertyRepository;
	readonly ga4DailyMetricRepo: TADomain.Ga4DailyMetricRepository;
	readonly trafficAnalyticsSchemaTables: readonly unknown[];
}

export const trafficAnalyticsModule: ContextModule = {
	id: 'traffic-analytics',
	compose(deps: SharedDeps): ContextRegistrations {
		const d = deps as unknown as TrafficAnalyticsDeps;
		const ingestGa4Rows = new IngestGa4RowsUseCase(
			d.ga4PropertyRepo,
			d.ga4DailyMetricRepo,
			d.ids,
			d.events,
			d.clock,
		);
		return {
			useCases: {
				LinkGa4Property: new LinkGa4PropertyUseCase(d.ga4PropertyRepo, d.clock, d.ids, d.events),
				UnlinkGa4Property: new UnlinkGa4PropertyUseCase(d.ga4PropertyRepo, d.clock),
				QueryGa4Metrics: new QueryGa4MetricsUseCase(d.ga4PropertyRepo, d.ga4DailyMetricRepo),
				IngestGa4Rows: ingestGa4Rows,
			},
			ingestUseCases: {
				'traffic-analytics:ingest-ga4-rows': {
					async execute({ rawPayloadId, rows, systemParams }) {
						await ingestGa4Rows.execute({
							ga4PropertyId: systemParams.ga4PropertyId as string,
							rawPayloadId,
							rows: rows as Parameters<typeof ingestGa4Rows.execute>[0]['rows'],
						});
					},
				},
			},
			eventHandlers: buildAutoScheduleHandlers(deps, trafficAnalyticsAutoScheduleConfigs),
			schemaTables: d.trafficAnalyticsSchemaTables,
		};
	},
};
