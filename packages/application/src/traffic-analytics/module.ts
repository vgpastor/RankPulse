import type { SharedKernel, TrafficAnalytics as TADomain } from '@rankpulse/domain';
import type { Clock, IdGenerator } from '@rankpulse/shared';
import type { ContextModule, ContextRegistrations, SharedDeps } from '../_core/module.js';
import { LinkGa4PropertyUseCase } from './use-cases/link-ga4-property.use-case.js';
import { QueryGa4MetricsUseCase } from './use-cases/query-ga4-metrics.use-case.js';
import { UnlinkGa4PropertyUseCase } from './use-cases/unlink-ga4-property.use-case.js';

export interface TrafficAnalyticsDeps {
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: SharedKernel.EventPublisher;
	readonly ga4PropertyRepo: TADomain.Ga4PropertyRepository;
	readonly ga4DailyMetricRepo: TADomain.Ga4DailyMetricRepository;
}

export const trafficAnalyticsModule: ContextModule = {
	id: 'traffic-analytics',
	compose(deps: SharedDeps): ContextRegistrations {
		const d = deps as unknown as TrafficAnalyticsDeps;
		return {
			useCases: {
				LinkGa4Property: new LinkGa4PropertyUseCase(d.ga4PropertyRepo, d.clock, d.ids, d.events),
				UnlinkGa4Property: new UnlinkGa4PropertyUseCase(d.ga4PropertyRepo, d.clock),
				QueryGa4Metrics: new QueryGa4MetricsUseCase(d.ga4PropertyRepo, d.ga4DailyMetricRepo),
			},
			ingestUseCases: {},
			eventHandlers: [],
			schemaTables: [],
		};
	},
};
