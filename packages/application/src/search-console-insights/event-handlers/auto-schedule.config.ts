import type { SearchConsoleInsights, SharedKernel } from '@rankpulse/domain';
import type { AutoScheduleConfig } from '../../_core/auto-schedule.js';

/**
 * Defaults for the auto-created GSC search-analytics JobDefinition.
 * Kept exported so integration tests and the composition root can lock
 * the contract independently of the config plumbing.
 *
 * Window:
 *  - `startDate: '{{today-30}}'` — GSC keeps 16 months of history but the
 *    rolling 30-day window is the operationally interesting one. Going
 *    longer would balloon the row count per fetch (rowLimit = 25k).
 *  - `endDate: '{{today-2}}'` — GSC has a ~2-day lag for fresh metrics.
 *    Querying yesterday returns mostly null rows.
 *
 * Cron is the descriptor's `defaultCron` (`0 5 * * *` = daily 05:00 UTC),
 * timed after GSC's nightly aggregation completes.
 */
export const GSC_AUTO_SCHEDULE_DEFAULTS = {
	providerId: 'google-search-console',
	endpointId: 'gsc-search-analytics',
	cron: '0 5 * * *',
	dimensions: ['date', 'query', 'page'] as const,
	rowLimit: 25_000,
	startDateToken: '{{today-30}}',
	endDateToken: '{{today-2}}',
};

/**
 * Auto-schedule configs owned by the search-console-insights context
 * (replaces the standalone `AutoScheduleOnGscPropertyLinkedHandler`
 * class — ADR 0002 Phase 4a).
 *
 * BACKLOG #23 / #21 — auto-schedule daily fetch when a GSC property is
 * linked. The processor (BACKLOG #22) resolves the relative date tokens
 * at every tick, so the rolling 30-day window stays current without any
 * further intervention.
 *
 * Failure mode (handled by `buildAutoScheduleHandlers`): scheduling
 * errors are LOGGED, not propagated. The link is already persisted;
 * failing the API call would leave a property in the DB and a 500 to
 * the caller. The operator can re-create the schedule manually from the
 * SchedulesPage if this fires.
 */
export const searchConsoleInsightsAutoScheduleConfigs: readonly AutoScheduleConfig[] = [
	{
		event: 'GscPropertyLinked',
		schedule: {
			providerId: GSC_AUTO_SCHEDULE_DEFAULTS.providerId,
			endpointId: GSC_AUTO_SCHEDULE_DEFAULTS.endpointId,
			cron: GSC_AUTO_SCHEDULE_DEFAULTS.cron,
			systemParamKey: 'gscPropertyId',
			paramsBuilder: (event: SharedKernel.DomainEvent) => {
				const e = event as SearchConsoleInsights.GscPropertyLinked;
				return {
					siteUrl: e.siteUrl,
					startDate: GSC_AUTO_SCHEDULE_DEFAULTS.startDateToken,
					endDate: GSC_AUTO_SCHEDULE_DEFAULTS.endDateToken,
					dimensions: [...GSC_AUTO_SCHEDULE_DEFAULTS.dimensions],
					rowLimit: GSC_AUTO_SCHEDULE_DEFAULTS.rowLimit,
				};
			},
			systemParamsBuilder: (event: SharedKernel.DomainEvent) => {
				const e = event as SearchConsoleInsights.GscPropertyLinked;
				return { organizationId: e.organizationId, gscPropertyId: e.gscPropertyId };
			},
		},
	},
];
