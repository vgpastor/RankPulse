import type { ExperienceAnalytics, SharedKernel } from '@rankpulse/domain';
import type { AutoScheduleConfig } from '../../_core/auto-schedule.js';

/**
 * Defaults for the auto-created Microsoft Clarity data-export JobDefinition.
 *
 * Cron is `0 6 * * *` (daily 06:00 UTC) — matches the descriptor's
 * defaultCron. Clarity's free tier caps the project at 10 req/day, so a
 * single daily fetch with `numOfDays = 1` keeps headroom for ad-hoc reruns.
 *
 * The Clarity API authenticates with a Bearer token that is itself scoped
 * to a single Clarity project — there is NO project-id query parameter.
 * That's why `params` only carries `numOfDays`; the project is implicit
 * in the credential. The internal `clarityProjectId` lives in
 * `systemParams` so the worker's processor can ingest snapshots into the
 * correct hypertable row without a runtime resolver lookup.
 */
export const CLARITY_AUTO_SCHEDULE_DEFAULTS = {
	providerId: 'microsoft-clarity',
	endpointId: 'clarity-data-export',
	cron: '0 6 * * *',
	numOfDays: 1,
};

/**
 * Auto-schedule configs owned by the experience-analytics context (replaces
 * the standalone `AutoScheduleOnClarityProjectLinkedHandler` class — ADR
 * 0002 Phase 4a).
 */
export const experienceAnalyticsAutoScheduleConfigs: readonly AutoScheduleConfig[] = [
	{
		event: 'ClarityProjectLinked',
		schedule: {
			providerId: CLARITY_AUTO_SCHEDULE_DEFAULTS.providerId,
			endpointId: CLARITY_AUTO_SCHEDULE_DEFAULTS.endpointId,
			cron: CLARITY_AUTO_SCHEDULE_DEFAULTS.cron,
			systemParamKey: 'clarityProjectId',
			paramsBuilder: () => ({ numOfDays: CLARITY_AUTO_SCHEDULE_DEFAULTS.numOfDays }),
			systemParamsBuilder: (event: SharedKernel.DomainEvent) => {
				const e = event as ExperienceAnalytics.ClarityProjectLinked;
				return { organizationId: e.organizationId, clarityProjectId: e.clarityProjectId };
			},
		},
	},
];
