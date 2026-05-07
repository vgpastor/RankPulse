import type { MetaAdsAttribution, SharedKernel } from '@rankpulse/domain';
import type { AutoScheduleConfig, AutoScheduleSpec } from '../../_core/auto-schedule.js';

/**
 * Defaults for the auto-created Meta Pixel events-stats JobDefinition.
 *
 * Cron `30 4 * * *` (daily 04:30 UTC) matches the descriptor's
 * `defaultCron`: Meta's pixel reporting has a ~1h ingestion lag, so 04:30
 * is safe for "yesterday".
 *
 * Window: rolling 30-day historical with `endDate: '{{today-1}}'` to skip
 * the in-progress current day. The worker resolves the relative tokens at
 * each tick.
 */
export const META_PIXEL_AUTO_SCHEDULE_DEFAULTS = {
	providerId: 'meta',
	endpointId: 'meta-pixel-events-stats',
	cron: '30 4 * * *',
	startDateToken: '{{today-30}}',
	endDateToken: '{{today-1}}',
};

/**
 * Two endpoints fan out from a single ad-account link: `meta-ads-insights`
 * (daily campaign performance) and `meta-custom-audiences` (weekly audience
 * inventory). Modeled as a static `schedules` list so both fire on a single
 * event with independent crons + params.
 *
 * Crons match the respective descriptor `defaultCron` values:
 *  - insights: 04:45 UTC daily — Meta's nightly aggregation completes ~04:00,
 *    leaves a small safety margin.
 *  - custom-audiences: 05:00 UTC every Monday — weekly inventory; daily would
 *    burn quota on noisy `approximate_count_*_bound` data.
 */
export const META_AD_ACCOUNT_AUTO_SCHEDULES_DEFAULTS = {
	providerId: 'meta',
	insightsEndpointId: 'meta-ads-insights',
	insightsCron: '45 4 * * *',
	insightsStartDateToken: '{{today-30}}',
	insightsEndDateToken: '{{today-1}}',
	customAudiencesEndpointId: 'meta-custom-audiences',
	customAudiencesCron: '0 5 * * 1',
};

const adAccountSchedules = (): readonly AutoScheduleSpec[] => [
	{
		providerId: META_AD_ACCOUNT_AUTO_SCHEDULES_DEFAULTS.providerId,
		endpointId: META_AD_ACCOUNT_AUTO_SCHEDULES_DEFAULTS.insightsEndpointId,
		cron: META_AD_ACCOUNT_AUTO_SCHEDULES_DEFAULTS.insightsCron,
		systemParamKey: 'metaAdAccountId',
		paramsBuilder: (event: SharedKernel.DomainEvent) => {
			const e = event as MetaAdsAttribution.MetaAdAccountLinked;
			return {
				adAccountId: e.adAccountHandle,
				startDate: META_AD_ACCOUNT_AUTO_SCHEDULES_DEFAULTS.insightsStartDateToken,
				endDate: META_AD_ACCOUNT_AUTO_SCHEDULES_DEFAULTS.insightsEndDateToken,
			};
		},
		systemParamsBuilder: (event: SharedKernel.DomainEvent) => {
			const e = event as MetaAdsAttribution.MetaAdAccountLinked;
			return { organizationId: e.organizationId, metaAdAccountId: e.metaAdAccountId };
		},
	},
	{
		providerId: META_AD_ACCOUNT_AUTO_SCHEDULES_DEFAULTS.providerId,
		endpointId: META_AD_ACCOUNT_AUTO_SCHEDULES_DEFAULTS.customAudiencesEndpointId,
		cron: META_AD_ACCOUNT_AUTO_SCHEDULES_DEFAULTS.customAudiencesCron,
		systemParamKey: 'metaAdAccountId',
		paramsBuilder: (event: SharedKernel.DomainEvent) => {
			const e = event as MetaAdsAttribution.MetaAdAccountLinked;
			return { adAccountId: e.adAccountHandle };
		},
		systemParamsBuilder: (event: SharedKernel.DomainEvent) => {
			const e = event as MetaAdsAttribution.MetaAdAccountLinked;
			return { organizationId: e.organizationId, metaAdAccountId: e.metaAdAccountId };
		},
	},
];

/**
 * Auto-schedule configs owned by the meta-ads-attribution context
 * (replaces the standalone `AutoScheduleOnMetaPixelLinkedHandler` and
 * `AutoScheduleOnMetaAdAccountLinkedHandler` classes — ADR 0002 Phase 4a).
 */
export const metaAdsAttributionAutoScheduleConfigs: readonly AutoScheduleConfig[] = [
	{
		event: 'MetaPixelLinked',
		schedule: {
			providerId: META_PIXEL_AUTO_SCHEDULE_DEFAULTS.providerId,
			endpointId: META_PIXEL_AUTO_SCHEDULE_DEFAULTS.endpointId,
			cron: META_PIXEL_AUTO_SCHEDULE_DEFAULTS.cron,
			systemParamKey: 'metaPixelId',
			paramsBuilder: (event: SharedKernel.DomainEvent) => {
				const e = event as MetaAdsAttribution.MetaPixelLinked;
				return {
					pixelId: e.pixelHandle,
					startDate: META_PIXEL_AUTO_SCHEDULE_DEFAULTS.startDateToken,
					endDate: META_PIXEL_AUTO_SCHEDULE_DEFAULTS.endDateToken,
				};
			},
			systemParamsBuilder: (event: SharedKernel.DomainEvent) => {
				const e = event as MetaAdsAttribution.MetaPixelLinked;
				return { organizationId: e.organizationId, metaPixelId: e.metaPixelId };
			},
		},
	},
	{
		event: 'MetaAdAccountLinked',
		schedules: adAccountSchedules(),
	},
];
