import type { BingWebmasterInsights as BWIDomain, SharedKernel } from '@rankpulse/domain';
import type { Clock, IdGenerator } from '@rankpulse/shared';
import type { ContextModule, ContextRegistrations, SharedDeps } from '../_core/module.js';
import { LinkBingPropertyUseCase } from './use-cases/link-bing-property.use-case.js';
import { QueryBingTrafficUseCase } from './use-cases/query-bing-traffic.use-case.js';
import { UnlinkBingPropertyUseCase } from './use-cases/unlink-bing-property.use-case.js';

export interface BingWebmasterInsightsDeps {
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: SharedKernel.EventPublisher;
	readonly bingPropertyRepo: BWIDomain.BingPropertyRepository;
	readonly bingTrafficObservationRepo: BWIDomain.BingTrafficObservationRepository;
}

export const bingWebmasterInsightsModule: ContextModule = {
	id: 'bing-webmaster-insights',
	compose(deps: SharedDeps): ContextRegistrations {
		const d = deps as unknown as BingWebmasterInsightsDeps;
		return {
			useCases: {
				LinkBingProperty: new LinkBingPropertyUseCase(d.bingPropertyRepo, d.clock, d.ids, d.events),
				UnlinkBingProperty: new UnlinkBingPropertyUseCase(d.bingPropertyRepo, d.clock),
				QueryBingTraffic: new QueryBingTrafficUseCase(d.bingPropertyRepo, d.bingTrafficObservationRepo),
			},
			ingestUseCases: {},
			eventHandlers: [],
			schemaTables: [],
		};
	},
};
