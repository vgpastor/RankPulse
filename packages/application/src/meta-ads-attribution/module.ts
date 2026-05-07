import type { MetaAdsAttribution as MAADomain, SharedKernel } from '@rankpulse/domain';
import type { Clock, IdGenerator } from '@rankpulse/shared';
import { buildAutoScheduleHandlers } from '../_core/auto-schedule.js';
import type { ContextModule, ContextRegistrations, SharedDeps } from '../_core/module.js';
import { metaAdsAttributionAutoScheduleConfigs } from './event-handlers/auto-schedule.config.js';
import { IngestMetaAdsInsightsUseCase } from './use-cases/ingest-meta-ads-insights.use-case.js';
import { IngestMetaPixelEventsUseCase } from './use-cases/ingest-meta-pixel-events.use-case.js';
import { LinkMetaAdAccountUseCase } from './use-cases/link-meta-ad-account.use-case.js';
import { LinkMetaPixelUseCase } from './use-cases/link-meta-pixel.use-case.js';
import { QueryMetaAdsInsightsUseCase } from './use-cases/query-meta-ads-insights.use-case.js';
import { QueryMetaPixelEventsUseCase } from './use-cases/query-meta-pixel-events.use-case.js';
import { UnlinkMetaAdAccountUseCase } from './use-cases/unlink-meta-ad-account.use-case.js';
import { UnlinkMetaPixelUseCase } from './use-cases/unlink-meta-pixel.use-case.js';

export interface MetaAdsAttributionDeps {
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: SharedKernel.EventPublisher;
	readonly metaPixelRepo: MAADomain.MetaPixelRepository;
	readonly metaAdAccountRepo: MAADomain.MetaAdAccountRepository;
	readonly metaPixelEventDailyRepo: MAADomain.MetaPixelEventDailyRepository;
	readonly metaAdsInsightDailyRepo: MAADomain.MetaAdsInsightDailyRepository;
	readonly metaAdsAttributionSchemaTables: readonly unknown[];
}

export const metaAdsAttributionModule: ContextModule = {
	id: 'meta-ads-attribution',
	compose(deps: SharedDeps): ContextRegistrations {
		const d = deps as unknown as MetaAdsAttributionDeps;
		const ingestMetaPixelEvents = new IngestMetaPixelEventsUseCase(
			d.metaPixelRepo,
			d.metaPixelEventDailyRepo,
			d.events,
			d.clock,
		);
		const ingestMetaAdsInsights = new IngestMetaAdsInsightsUseCase(
			d.metaAdAccountRepo,
			d.metaAdsInsightDailyRepo,
			d.events,
			d.clock,
		);
		return {
			useCases: {
				LinkMetaPixel: new LinkMetaPixelUseCase(d.metaPixelRepo, d.clock, d.ids, d.events),
				UnlinkMetaPixel: new UnlinkMetaPixelUseCase(d.metaPixelRepo, d.clock),
				LinkMetaAdAccount: new LinkMetaAdAccountUseCase(d.metaAdAccountRepo, d.clock, d.ids, d.events),
				UnlinkMetaAdAccount: new UnlinkMetaAdAccountUseCase(d.metaAdAccountRepo, d.clock),
				QueryMetaPixelEvents: new QueryMetaPixelEventsUseCase(d.metaPixelRepo, d.metaPixelEventDailyRepo),
				QueryMetaAdsInsights: new QueryMetaAdsInsightsUseCase(d.metaAdAccountRepo, d.metaAdsInsightDailyRepo),
				IngestMetaPixelEvents: ingestMetaPixelEvents,
				IngestMetaAdsInsights: ingestMetaAdsInsights,
			},
			ingestUseCases: {
				'meta-ads-attribution:ingest-meta-pixel-events': {
					async execute({ rawPayloadId, rows, systemParams }) {
						await ingestMetaPixelEvents.execute({
							metaPixelId: systemParams.metaPixelId as string,
							rawPayloadId,
							rows: rows as Parameters<typeof ingestMetaPixelEvents.execute>[0]['rows'],
						});
					},
				},
				'meta-ads-attribution:ingest-meta-ads-insights': {
					async execute({ rawPayloadId, rows, systemParams }) {
						await ingestMetaAdsInsights.execute({
							metaAdAccountId: systemParams.metaAdAccountId as string,
							rawPayloadId,
							rows: rows as Parameters<typeof ingestMetaAdsInsights.execute>[0]['rows'],
						});
					},
				},
			},
			eventHandlers: buildAutoScheduleHandlers(deps, metaAdsAttributionAutoScheduleConfigs),
			schemaTables: d.metaAdsAttributionSchemaTables,
		};
	},
};
