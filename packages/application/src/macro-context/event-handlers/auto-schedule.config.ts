import type { MacroContext, SharedKernel } from '@rankpulse/domain';
import type { AutoScheduleConfig } from '../../_core/auto-schedule.js';

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
 * Auto-schedule configs owned by the macro-context bounded context
 * (replaces the standalone `AutoScheduleOnMonitoredDomainAddedHandler`
 * class — ADR 0002 Phase 4a).
 */
export const macroContextAutoScheduleConfigs: readonly AutoScheduleConfig[] = [
	{
		event: 'MonitoredDomainAdded',
		schedule: {
			providerId: RADAR_AUTO_SCHEDULE_DEFAULTS.providerId,
			endpointId: RADAR_AUTO_SCHEDULE_DEFAULTS.endpointId,
			cron: RADAR_AUTO_SCHEDULE_DEFAULTS.cron,
			systemParamKey: 'monitoredDomainId',
			paramsBuilder: (event: SharedKernel.DomainEvent) => {
				const e = event as MacroContext.MonitoredDomainAdded;
				return { domain: e.domain };
			},
			systemParamsBuilder: (event: SharedKernel.DomainEvent) => {
				const e = event as MacroContext.MonitoredDomainAdded;
				return { organizationId: e.organizationId, monitoredDomainId: e.monitoredDomainId };
			},
		},
	},
];
