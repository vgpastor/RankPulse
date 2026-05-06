import type { EntityAwareness, SharedKernel } from '@rankpulse/domain';
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
 * Defaults for the auto-created Wikipedia pageviews-per-article JobDefinition.
 *
 * Window: rolling 30-day pull ending yesterday. Wikipedia keeps multi-year
 * pageview history, but the operationally interesting signal is the recent
 * trend; pulling further back wastes bandwidth on rows we already persisted.
 *
 * Cron is `0 6 * * *` (daily 06:00 UTC) — staggered after the 05:00 GSC/GA4
 * crons so a project that links several providers fans the worker load out
 * across consecutive ticks instead of all firing simultaneously.
 *
 * Granularity is `daily`; the descriptor accepts `monthly` too but daily
 * matches the ingest schema (one observation per day per article).
 *
 * `start`/`end` are param keys (NOT `startDate`/`endDate`) to match the
 * Wikimedia REST path: /metrics/pageviews/per-article/.../{start}/{end}.
 */
export const WIKIPEDIA_AUTO_SCHEDULE_DEFAULTS = {
	providerId: 'wikipedia',
	endpointId: 'wikipedia-pageviews-per-article',
	cron: '0 6 * * *',
	granularity: 'daily',
	startToken: '{{today-30}}',
	endToken: '{{today-1}}',
};

/**
 * Auto-schedule daily Wikipedia pageviews fetch when an article is linked.
 *
 * Listens to `WikipediaArticleLinked` and invokes `ScheduleEndpointFetchUseCase`
 * with the daily-cron defaults so the worker starts persisting per-article
 * pageview observations immediately. Idempotency on `wikipediaArticleId` so
 * re-emission of the link event (replay, reconnect, dual delivery) returns
 * the existing definitionId instead of creating a duplicate.
 *
 * Failure mode: scheduling errors are LOGGED, not propagated. The link is
 * already persisted; failing the API call would leave a half-state.
 */
export class AutoScheduleOnWikipediaArticleLinkedHandler {
	constructor(
		private readonly scheduleEndpointFetch: ScheduleEndpointFetchUseCase,
		private readonly logger: EventHandlerLogger = NOOP_LOGGER,
	) {}

	async handle(event: SharedKernel.DomainEvent): Promise<void> {
		// Defensive type narrowing — same publisher fans events of all types
		// to every listener; we only react to ours.
		if (event.type !== 'WikipediaArticleLinked') return;
		const { articleId, projectId, organizationId, wikipediaProject, slug } =
			event as EntityAwareness.WikipediaArticleLinked;

		try {
			const result = await this.scheduleEndpointFetch.execute({
				projectId,
				providerId: WIKIPEDIA_AUTO_SCHEDULE_DEFAULTS.providerId,
				endpointId: WIKIPEDIA_AUTO_SCHEDULE_DEFAULTS.endpointId,
				params: {
					project: wikipediaProject,
					article: slug,
					granularity: WIKIPEDIA_AUTO_SCHEDULE_DEFAULTS.granularity,
					start: WIKIPEDIA_AUTO_SCHEDULE_DEFAULTS.startToken,
					end: WIKIPEDIA_AUTO_SCHEDULE_DEFAULTS.endToken,
				},
				systemParams: { organizationId, wikipediaArticleId: articleId },
				cron: WIKIPEDIA_AUTO_SCHEDULE_DEFAULTS.cron,
				credentialOverrideId: null,
				idempotencyKey: {
					systemParamKey: 'wikipediaArticleId',
					systemParamValue: articleId,
				},
			});
			this.logger.info(
				{ wikipediaArticleId: articleId, definitionId: result.definitionId },
				'auto-scheduled daily Wikipedia pageviews fetch on link',
			);
		} catch (err) {
			this.logger.error(
				{ wikipediaArticleId: articleId, err: err instanceof Error ? err.message : String(err) },
				'auto-schedule failed on WikipediaArticleLinked — operator must schedule manually',
			);
		}
	}
}
