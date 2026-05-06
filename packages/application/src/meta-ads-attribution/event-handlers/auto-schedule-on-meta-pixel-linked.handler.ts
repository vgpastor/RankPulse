import type { MetaAdsAttribution, SharedKernel } from '@rankpulse/domain';
import type { ScheduleEndpointFetchUseCase } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';

export interface EventHandlerLogger {
	info(meta: object, msg: string): void;
	error(meta: object, msg: string): void;
}

const NOOP_LOGGER: EventHandlerLogger = { info: () => {}, error: () => {} };

/**
 * Defaults for the auto-created Meta Pixel events-stats JobDefinition.
 *
 * Cron `30 4 * * *` (daily 04:30 UTC) matches the descriptor's
 * `defaultCron`: Meta's pixel reporting has a ~1h ingestion lag, so 04:30
 * is safe for "yesterday".
 *
 * Window: rolling 30-day historical with `endDate: '{{today-1}}'` to skip
 * the in-progress current day. The worker resolves the relative tokens at
 * each tick.
 */
export const META_PIXEL_AUTO_SCHEDULE_DEFAULTS = {
	providerId: 'meta',
	endpointId: 'meta-pixel-events-stats',
	cron: '30 4 * * *',
	startDateToken: '{{today-30}}',
	endDateToken: '{{today-1}}',
};

/**
 * Auto-schedule daily Meta Pixel events-stats fetch on pixel link.
 * Idempotent on `metaPixelId` so re-emission of the link event (replay,
 * reconnect, dual delivery) returns the existing definitionId. Errors
 * are logged, not propagated — the link is already persisted, failing
 * here would be a useless 500 to the API caller.
 */
export class AutoScheduleOnMetaPixelLinkedHandler {
	constructor(
		private readonly scheduleEndpointFetch: ScheduleEndpointFetchUseCase,
		private readonly logger: EventHandlerLogger = NOOP_LOGGER,
	) {}

	async handle(event: SharedKernel.DomainEvent): Promise<void> {
		if (event.type !== 'MetaPixelLinked') return;
		const { metaPixelId, projectId, organizationId, pixelHandle } =
			event as MetaAdsAttribution.MetaPixelLinked;

		try {
			const result = await this.scheduleEndpointFetch.execute({
				projectId,
				providerId: META_PIXEL_AUTO_SCHEDULE_DEFAULTS.providerId,
				endpointId: META_PIXEL_AUTO_SCHEDULE_DEFAULTS.endpointId,
				params: {
					pixelId: pixelHandle,
					startDate: META_PIXEL_AUTO_SCHEDULE_DEFAULTS.startDateToken,
					endDate: META_PIXEL_AUTO_SCHEDULE_DEFAULTS.endDateToken,
				},
				systemParams: { organizationId, metaPixelId },
				cron: META_PIXEL_AUTO_SCHEDULE_DEFAULTS.cron,
				credentialOverrideId: null,
				idempotencyKey: { systemParamKey: 'metaPixelId', systemParamValue: metaPixelId },
			});
			this.logger.info(
				{ metaPixelId, definitionId: result.definitionId },
				'auto-scheduled daily Meta Pixel fetch on pixel link',
			);
		} catch (err) {
			this.logger.error(
				{ metaPixelId, err: err instanceof Error ? err.message : String(err) },
				'auto-schedule failed on MetaPixelLinked — operator must schedule manually',
			);
		}
	}
}
