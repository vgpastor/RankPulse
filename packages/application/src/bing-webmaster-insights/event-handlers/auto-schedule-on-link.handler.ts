import type { BingWebmasterInsights, SharedKernel } from '@rankpulse/domain';
import type { ScheduleEndpointFetchUseCase } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';

export interface EventHandlerLogger {
	info(meta: object, msg: string): void;
	error(meta: object, msg: string): void;
}

const NOOP_LOGGER: EventHandlerLogger = {
	info: () => {},
	error: () => {},
};

/**
 * Defaults for the auto-created Bing rank-and-traffic JobDefinition.
 *
 * Cron is `0 5 * * *` (daily 05:00 UTC). The Bing endpoint always returns the
 * full rolling 6-month window, so re-fetching daily and letting the natural-key
 * PK on `(siteUrl, observedDate)` swallow re-writes is the simplest model —
 * no incremental cursor required.
 *
 * `siteUrl` is the only descriptor param: it is a literal string carried on
 * the link event, so we forward it directly. `bingPropertyId` lives in
 * `systemParams` so the worker can resolve the credential without a runtime
 * resolver lookup (the whole point of this refactor).
 */
export const BING_AUTO_SCHEDULE_DEFAULTS = {
	providerId: 'bing-webmaster',
	endpointId: 'bing-rank-and-traffic-stats',
	cron: '0 5 * * *',
};

/**
 * Auto-schedule daily Bing rank-and-traffic fetch when a property is linked.
 *
 * Listens to `BingPropertyLinked` and invokes `ScheduleEndpointFetchUseCase`
 * with the daily-cron defaults so the worker starts persisting per-day click
 * and impression observations immediately. Idempotency on `bingPropertyId`
 * so re-emission of the link event (replay, reconnect, dual delivery) returns
 * the existing definitionId instead of creating a duplicate.
 *
 * Failure mode: scheduling errors are LOGGED, not propagated. The link is
 * already persisted; failing the API call would leave a half-state.
 */
export class AutoScheduleOnBingPropertyLinkedHandler {
	constructor(
		private readonly scheduleEndpointFetch: ScheduleEndpointFetchUseCase,
		private readonly logger: EventHandlerLogger = NOOP_LOGGER,
	) {}

	async handle(event: SharedKernel.DomainEvent): Promise<void> {
		// Defensive type narrowing — same publisher fans events of all types
		// to every listener; we only react to ours.
		if (event.type !== 'BingPropertyLinked') return;
		const { bingPropertyId, projectId, organizationId, siteUrl } =
			event as BingWebmasterInsights.BingPropertyLinked;

		try {
			const result = await this.scheduleEndpointFetch.execute({
				projectId,
				providerId: BING_AUTO_SCHEDULE_DEFAULTS.providerId,
				endpointId: BING_AUTO_SCHEDULE_DEFAULTS.endpointId,
				params: { siteUrl },
				systemParams: { organizationId, bingPropertyId },
				cron: BING_AUTO_SCHEDULE_DEFAULTS.cron,
				credentialOverrideId: null,
				idempotencyKey: {
					systemParamKey: 'bingPropertyId',
					systemParamValue: bingPropertyId,
				},
			});
			this.logger.info(
				{ bingPropertyId, definitionId: result.definitionId },
				'auto-scheduled daily Bing fetch on property link',
			);
		} catch (err) {
			this.logger.error(
				{ bingPropertyId, err: err instanceof Error ? err.message : String(err) },
				'auto-schedule failed on BingPropertyLinked — operator must schedule manually',
			);
		}
	}
}
