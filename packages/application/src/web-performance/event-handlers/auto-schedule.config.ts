import type { SharedKernel, WebPerformance } from '@rankpulse/domain';
import type { AutoScheduleConfig } from '../../_core/auto-schedule.js';

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
 * the config MUST surface it there for the snapshot ACL to find its row.
 */
export const PSI_AUTO_SCHEDULE_DEFAULTS = {
	providerId: 'pagespeed',
	endpointId: 'psi-runpagespeed',
	cron: '0 7 * * *',
};

/**
 * Auto-schedule configs owned by the web-performance context (replaces
 * the standalone `AutoScheduleOnTrackedPageAddedHandler` class — ADR
 * 0002 Phase 4a).
 */
export const webPerformanceAutoScheduleConfigs: readonly AutoScheduleConfig[] = [
	{
		event: 'TrackedPageAdded',
		schedule: {
			providerId: PSI_AUTO_SCHEDULE_DEFAULTS.providerId,
			endpointId: PSI_AUTO_SCHEDULE_DEFAULTS.endpointId,
			cron: PSI_AUTO_SCHEDULE_DEFAULTS.cron,
			systemParamKey: 'trackedPageId',
			paramsBuilder: (event: SharedKernel.DomainEvent) => {
				const e = event as WebPerformance.TrackedPageAdded;
				return { url: e.url, strategy: e.strategy };
			},
			systemParamsBuilder: (event: SharedKernel.DomainEvent) => {
				const e = event as WebPerformance.TrackedPageAdded;
				return { organizationId: e.organizationId, trackedPageId: e.trackedPageId };
			},
		},
	},
];
