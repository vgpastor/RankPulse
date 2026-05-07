import type { SharedKernel, TrafficAnalytics } from '@rankpulse/domain';
import type { AutoScheduleConfig } from '../../_core/auto-schedule.js';

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
 * Auto-schedule configs owned by the traffic-analytics context (replaces
 * the standalone `AutoScheduleOnGa4PropertyLinkedHandler` class — ADR
 * 0002 Phase 4a).
 *
 * Idempotency on `ga4PropertyId` so re-emission of the link event (replay,
 * reconnect, dual delivery) returns the existing definitionId.
 */
export const trafficAnalyticsAutoScheduleConfigs: readonly AutoScheduleConfig[] = [
	{
		event: 'Ga4PropertyLinked',
		schedule: {
			providerId: GA4_AUTO_SCHEDULE_DEFAULTS.providerId,
			endpointId: GA4_AUTO_SCHEDULE_DEFAULTS.endpointId,
			cron: GA4_AUTO_SCHEDULE_DEFAULTS.cron,
			systemParamKey: 'ga4PropertyId',
			paramsBuilder: (event: SharedKernel.DomainEvent) => {
				const e = event as TrafficAnalytics.Ga4PropertyLinked;
				return {
					propertyId: e.propertyHandle,
					startDate: GA4_AUTO_SCHEDULE_DEFAULTS.startDateToken,
					endDate: GA4_AUTO_SCHEDULE_DEFAULTS.endDateToken,
				};
			},
			systemParamsBuilder: (event: SharedKernel.DomainEvent) => {
				const e = event as TrafficAnalytics.Ga4PropertyLinked;
				return { organizationId: e.organizationId, ga4PropertyId: e.ga4PropertyId };
			},
		},
	},
];
