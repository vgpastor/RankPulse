import type { BingWebmasterInsights as BWIDomain, SharedKernel } from '@rankpulse/domain';
import type { Clock, IdGenerator } from '@rankpulse/shared';
import { buildAutoScheduleHandlers } from '../_core/auto-schedule.js';
import type { ContextModule, ContextRegistrations, SharedDeps } from '../_core/module.js';
import { bingWebmasterInsightsAutoScheduleConfigs } from './event-handlers/auto-schedule.config.js';
import { IngestBingTrafficUseCase } from './use-cases/ingest-bing-traffic.use-case.js';
import { LinkBingPropertyUseCase } from './use-cases/link-bing-property.use-case.js';
import { QueryBingTrafficUseCase } from './use-cases/query-bing-traffic.use-case.js';
import { UnlinkBingPropertyUseCase } from './use-cases/unlink-bing-property.use-case.js';

export interface BingWebmasterInsightsDeps {
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: SharedKernel.EventPublisher;
	readonly bingPropertyRepo: BWIDomain.BingPropertyRepository;
	readonly bingTrafficObservationRepo: BWIDomain.BingTrafficObservationRepository;
	readonly bingWebmasterInsightsSchemaTables: readonly unknown[];
}

export const bingWebmasterInsightsModule: ContextModule = {
	id: 'bing-webmaster-insights',
	compose(deps: SharedDeps): ContextRegistrations {
		const d = deps as unknown as BingWebmasterInsightsDeps;
		const ingestBingTraffic = new IngestBingTrafficUseCase(
			d.bingPropertyRepo,
			d.bingTrafficObservationRepo,
			d.events,
			d.clock,
		);
		return {
			useCases: {
				LinkBingProperty: new LinkBingPropertyUseCase(d.bingPropertyRepo, d.clock, d.ids, d.events),
				UnlinkBingProperty: new UnlinkBingPropertyUseCase(d.bingPropertyRepo, d.clock),
				QueryBingTraffic: new QueryBingTrafficUseCase(d.bingPropertyRepo, d.bingTrafficObservationRepo),
				IngestBingTraffic: ingestBingTraffic,
			},
			ingestUseCases: {
				'bing-webmaster-insights:ingest-bing-traffic': {
					async execute({ rawPayloadId, rows, systemParams }) {
						await ingestBingTraffic.execute({
							bingPropertyId: systemParams.bingPropertyId as string,
							rawPayloadId,
							rows: rows as Parameters<typeof ingestBingTraffic.execute>[0]['rows'],
						});
					},
				},
			},
			eventHandlers: buildAutoScheduleHandlers(deps, bingWebmasterInsightsAutoScheduleConfigs),
			schemaTables: d.bingWebmasterInsightsSchemaTables,
		};
	},
};
