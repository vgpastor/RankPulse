import type { SharedKernel, TrafficAnalytics } from '@rankpulse/domain';
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
 * Defaults for the auto-created GA4 run-report JobDefinition.
 *
 * Window:
 *  - `startDate: '{{today-30}}'` — rolling 30-day window. GA4 keeps 14 months
 *    by default but the operationally interesting window is short.
 *  - `endDate: '{{today-2}}'` — GA4 has a ~24h finalisation lag for some
 *    metrics; querying `today-2` returns stable rows.
 *
 * Cron is `0 5 * * *` (daily 05:00 UTC) — matches GSC defaults so a project
 * with both providers fans out at the same tick.
 */
export const GA4_AUTO_SCHEDULE_DEFAULTS = {
	providerId: 'google-analytics-4',
	endpointId: 'ga4-run-report',
	cron: '0 5 * * *',
	startDateToken: '{{today-30}}',
	endDateToken: '{{today-2}}',
};

/**
 * Auto-schedule daily GA4 fetch when a property is linked.
 *
 * Listens to `Ga4PropertyLinked` and invokes `ScheduleEndpointFetchUseCase`
 * with the daily-cron defaults so the worker starts persisting GA4 rows
 * immediately. Idempotency on `ga4PropertyId` so re-emission of the link
 * event (replay, reconnect, dual delivery) returns the existing
 * definitionId instead of creating a duplicate.
 *
 * Failure mode: scheduling errors are LOGGED, not propagated. The link is
 * already persisted; failing the API call would leave a half-state.
 */
export class AutoScheduleOnGa4PropertyLinkedHandler {
	constructor(
		private readonly scheduleEndpointFetch: ScheduleEndpointFetchUseCase,
		private readonly logger: EventHandlerLogger = NOOP_LOGGER,
	) {}

	async handle(event: SharedKernel.DomainEvent): Promise<void> {
		if (event.type !== 'Ga4PropertyLinked') return;
		const { ga4PropertyId, projectId, organizationId, propertyHandle } =
			event as TrafficAnalytics.Ga4PropertyLinked;

		try {
			const result = await this.scheduleEndpointFetch.execute({
				projectId,
				providerId: GA4_AUTO_SCHEDULE_DEFAULTS.providerId,
				endpointId: GA4_AUTO_SCHEDULE_DEFAULTS.endpointId,
				params: {
					propertyId: propertyHandle,
					startDate: GA4_AUTO_SCHEDULE_DEFAULTS.startDateToken,
					endDate: GA4_AUTO_SCHEDULE_DEFAULTS.endDateToken,
				},
				systemParams: { organizationId, ga4PropertyId },
				cron: GA4_AUTO_SCHEDULE_DEFAULTS.cron,
				credentialOverrideId: null,
				idempotencyKey: { systemParamKey: 'ga4PropertyId', systemParamValue: ga4PropertyId },
			});
			this.logger.info(
				{ ga4PropertyId, definitionId: result.definitionId },
				'auto-scheduled daily GA4 fetch on property link',
			);
		} catch (err) {
			this.logger.error(
				{ ga4PropertyId, err: err instanceof Error ? err.message : String(err) },
				'auto-schedule failed on Ga4PropertyLinked — operator must schedule manually',
			);
		}
	}
}
