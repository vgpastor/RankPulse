import type { BingWebmasterInsights, SharedKernel } from '@rankpulse/domain';
import type { AutoScheduleConfig } from '../../_core/auto-schedule.js';

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
 * Auto-schedule configs owned by the bing-webmaster-insights context
 * (replaces the standalone `AutoScheduleOnBingPropertyLinkedHandler`
 * class — ADR 0002 Phase 4a).
 */
export const bingWebmasterInsightsAutoScheduleConfigs: readonly AutoScheduleConfig[] = [
	{
		event: 'BingPropertyLinked',
		schedule: {
			providerId: BING_AUTO_SCHEDULE_DEFAULTS.providerId,
			endpointId: BING_AUTO_SCHEDULE_DEFAULTS.endpointId,
			cron: BING_AUTO_SCHEDULE_DEFAULTS.cron,
			systemParamKey: 'bingPropertyId',
			paramsBuilder: (event: SharedKernel.DomainEvent) => {
				const e = event as BingWebmasterInsights.BingPropertyLinked;
				return { siteUrl: e.siteUrl };
			},
			systemParamsBuilder: (event: SharedKernel.DomainEvent) => {
				const e = event as BingWebmasterInsights.BingPropertyLinked;
				return { organizationId: e.organizationId, bingPropertyId: e.bingPropertyId };
			},
		},
	},
];
