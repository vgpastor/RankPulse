import type { MacroContext, SharedKernel } from '@rankpulse/domain';
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
 * Defaults for the auto-created Cloudflare Radar `radar-domain-rank` JobDefinition.
 *
 * Cron is `0 6 * * *` (daily 06:00 UTC) — staggered ahead of the other auto-
 * schedules (GSC 03:00, GA4 04:00, Bing 05:00, PSI 07:00) so a fresh tenant
 * doesn't fan-out every connector at the same wall-clock minute. Radar itself
 * publishes its 30-day rolling rank once per day, so daily polling is the
 * sweet spot — more frequent runs would just hit the same snapshot.
 *
 * The worker's `radar-domain-rank` ingest block reads
 * `systemParams.monitoredDomainId` (apps/worker/.../provider-fetch.processor.ts
 * line ~474) to attribute the snapshot back to its aggregate. Surfacing it
 * here is what lets the ACL find its row.
 */
export const RADAR_AUTO_SCHEDULE_DEFAULTS = {
	providerId: 'cloudflare-radar',
	endpointId: 'radar-domain-rank',
	cron: '0 6 * * *',
};

/**
 * Auto-schedule daily Cloudflare Radar fetch when a monitored domain is added.
 *
 * Listens to `MonitoredDomainAdded` and invokes `ScheduleEndpointFetchUseCase`
 * with the daily-cron defaults so the worker starts persisting global-rank
 * snapshots for the domain immediately. Idempotency on `monitoredDomainId`
 * so re-emission of the add event (replay, double publish) returns the
 * existing definitionId rather than creating a duplicate.
 *
 * Failure mode: scheduling errors are LOGGED, not propagated. The monitored
 * domain is already persisted; failing the API call would leave a half-state
 * where the operator thinks the domain exists but no rank ever lands.
 */
export class AutoScheduleOnMonitoredDomainAddedHandler {
	constructor(
		private readonly scheduleEndpointFetch: ScheduleEndpointFetchUseCase,
		private readonly logger: EventHandlerLogger = NOOP_LOGGER,
	) {}

	async handle(event: SharedKernel.DomainEvent): Promise<void> {
		// Defensive type narrowing — same publisher fans events of all types
		// to every listener; we only react to ours.
		if (event.type !== 'MonitoredDomainAdded') return;
		const { monitoredDomainId, projectId, organizationId, domain } =
			event as MacroContext.MonitoredDomainAdded;

		try {
			const result = await this.scheduleEndpointFetch.execute({
				projectId,
				providerId: RADAR_AUTO_SCHEDULE_DEFAULTS.providerId,
				endpointId: RADAR_AUTO_SCHEDULE_DEFAULTS.endpointId,
				params: { domain },
				systemParams: { organizationId, monitoredDomainId },
				cron: RADAR_AUTO_SCHEDULE_DEFAULTS.cron,
				credentialOverrideId: null,
				idempotencyKey: {
					systemParamKey: 'monitoredDomainId',
					systemParamValue: monitoredDomainId,
				},
			});
			this.logger.info(
				{ monitoredDomainId, definitionId: result.definitionId },
				'auto-scheduled daily Cloudflare Radar fetch on domain add',
			);
		} catch (err) {
			this.logger.error(
				{ monitoredDomainId, err: err instanceof Error ? err.message : String(err) },
				'auto-schedule failed on MonitoredDomainAdded — operator must schedule manually',
			);
		}
	}
}
