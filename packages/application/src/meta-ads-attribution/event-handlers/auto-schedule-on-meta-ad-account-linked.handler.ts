import type { MetaAdsAttribution, SharedKernel } from '@rankpulse/domain';
import type { ScheduleEndpointFetchUseCase } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';
// Re-uses the EventHandlerLogger contract declared by the sibling Pixel
// handler; the two share the same `{info, error}` shape and live in the
// same bounded context, so duplicating the interface would just churn.
import type { EventHandlerLogger } from './auto-schedule-on-meta-pixel-linked.handler.js';

const NOOP_LOGGER: EventHandlerLogger = { info: () => {}, error: () => {} };

/**
 * Two endpoints fan out from a single ad-account link: `meta-ads-insights`
 * (daily campaign performance) and `meta-custom-audiences` (weekly audience
 * inventory). Each entry is one schedule call inside the handler.
 *
 * Crons match the respective descriptor `defaultCron` values:
 *  - insights: 04:45 UTC daily — Meta's nightly aggregation completes
 *    ~04:00 UTC, leaves a small safety margin.
 *  - custom-audiences: 05:00 UTC every Monday — weekly inventory; daily
 *    would burn quota on noisy `approximate_count_*_bound` data.
 */
interface AdAccountEndpointSchedule {
	endpointId: string;
	cron: string;
	buildParams(adAccountHandle: string): Record<string, unknown>;
	logTag: string;
}

export const META_AD_ACCOUNT_AUTO_SCHEDULES: readonly AdAccountEndpointSchedule[] = [
	{
		endpointId: 'meta-ads-insights',
		cron: '45 4 * * *',
		buildParams: (adAccountHandle) => ({
			adAccountId: adAccountHandle,
			startDate: '{{today-30}}',
			endDate: '{{today-1}}',
		}),
		logTag: 'meta-ads-insights',
	},
	{
		endpointId: 'meta-custom-audiences',
		cron: '0 5 * * 1',
		buildParams: (adAccountHandle) => ({
			adAccountId: adAccountHandle,
		}),
		logTag: 'meta-custom-audiences',
	},
];

export const META_AD_ACCOUNT_PROVIDER_ID = 'meta';

/**
 * Auto-schedule fans BOTH Meta ad-account-scoped endpoints on link.
 * Idempotent on `(metaAdAccountId, endpointId)` so re-emission doesn't
 * duplicate either schedule. Errors per-schedule are logged but don't
 * abort the sibling — failing one endpoint shouldn't block the other.
 */
export class AutoScheduleOnMetaAdAccountLinkedHandler {
	constructor(
		private readonly scheduleEndpointFetch: ScheduleEndpointFetchUseCase,
		private readonly logger: EventHandlerLogger = NOOP_LOGGER,
		private readonly schedules: readonly AdAccountEndpointSchedule[] = META_AD_ACCOUNT_AUTO_SCHEDULES,
	) {}

	async handle(event: SharedKernel.DomainEvent): Promise<void> {
		if (event.type !== 'MetaAdAccountLinked') return;
		const { metaAdAccountId, projectId, organizationId, adAccountHandle } =
			event as MetaAdsAttribution.MetaAdAccountLinked;

		await Promise.all(
			this.schedules.map(async (schedule) => {
				try {
					const result = await this.scheduleEndpointFetch.execute({
						projectId,
						providerId: META_AD_ACCOUNT_PROVIDER_ID,
						endpointId: schedule.endpointId,
						params: schedule.buildParams(adAccountHandle),
						systemParams: { organizationId, metaAdAccountId },
						cron: schedule.cron,
						credentialOverrideId: null,
						idempotencyKey: {
							systemParamKey: 'metaAdAccountId',
							systemParamValue: metaAdAccountId,
						},
					});
					this.logger.info(
						{ metaAdAccountId, endpointId: schedule.endpointId, definitionId: result.definitionId },
						`auto-scheduled ${schedule.logTag} on ad-account link`,
					);
				} catch (err) {
					this.logger.error(
						{
							metaAdAccountId,
							endpointId: schedule.endpointId,
							err: err instanceof Error ? err.message : String(err),
						},
						`auto-schedule failed on MetaAdAccountLinked → ${schedule.logTag} — operator must schedule manually`,
					);
				}
			}),
		);
	}
}
