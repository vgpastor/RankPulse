import type { SharedKernel, WebPerformance } from '@rankpulse/domain';
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
 * Defaults for the auto-created PSI runPagespeed JobDefinition.
 *
 * Cron is `0 7 * * *` (daily 07:00 UTC) — staggered one hour after the
 * descriptor's `0 3 * * *` baseline so per-tenant auto-schedules don't all
 * collide on the same wall clock the moment a project is bootstrapped. PSI
 * v5 is free, so the cost ledger is informational; rate limit is 1 req/sec
 * which a single per-page daily cron cannot exceed.
 *
 * The provider id is `'pagespeed'` (NOT `'pagespeed-insights'`) — that is
 * the `Provider.id` registered by `PageSpeedProvider`. The worker's
 * `psi-runpagespeed` ingest block reads `systemParams.trackedPageId`, so
 * the handler MUST surface it there for the snapshot ACL to find its row.
 */
export const PSI_AUTO_SCHEDULE_DEFAULTS = {
	providerId: 'pagespeed',
	endpointId: 'psi-runpagespeed',
	cron: '0 7 * * *',
};

/**
 * Auto-schedule daily PSI run when a tracked page is added.
 *
 * Listens to `TrackedPageAdded` and invokes `ScheduleEndpointFetchUseCase`
 * with the daily-cron defaults so the worker starts persisting Core Web
 * Vitals snapshots for the URL immediately. Idempotency on `trackedPageId`
 * so re-emission of the add event (replay, double publish) returns the
 * existing definitionId rather than creating a duplicate.
 *
 * Failure mode: scheduling errors are LOGGED, not propagated. The tracked
 * page is already persisted; failing the API call would leave a half-state
 * where the operator thinks the page exists but no metrics ever land.
 */
export class AutoScheduleOnTrackedPageAddedHandler {
	constructor(
		private readonly scheduleEndpointFetch: ScheduleEndpointFetchUseCase,
		private readonly logger: EventHandlerLogger = NOOP_LOGGER,
	) {}

	async handle(event: SharedKernel.DomainEvent): Promise<void> {
		// Defensive type narrowing — same publisher fans events of all types
		// to every listener; we only react to ours.
		if (event.type !== 'TrackedPageAdded') return;
		const { trackedPageId, projectId, organizationId, url, strategy } =
			event as WebPerformance.TrackedPageAdded;

		try {
			const result = await this.scheduleEndpointFetch.execute({
				projectId,
				providerId: PSI_AUTO_SCHEDULE_DEFAULTS.providerId,
				endpointId: PSI_AUTO_SCHEDULE_DEFAULTS.endpointId,
				params: { url, strategy },
				systemParams: { organizationId, trackedPageId },
				cron: PSI_AUTO_SCHEDULE_DEFAULTS.cron,
				credentialOverrideId: null,
				idempotencyKey: {
					systemParamKey: 'trackedPageId',
					systemParamValue: trackedPageId,
				},
			});
			this.logger.info(
				{ trackedPageId, definitionId: result.definitionId },
				'auto-scheduled daily PSI run on tracked-page add',
			);
		} catch (err) {
			this.logger.error(
				{ trackedPageId, err: err instanceof Error ? err.message : String(err) },
				'auto-schedule failed on TrackedPageAdded — operator must schedule manually',
			);
		}
	}
}
