import type { EntityAwareness, SharedKernel } from '@rankpulse/domain';
import type { AutoScheduleConfig } from '../../_core/auto-schedule.js';

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
 * Auto-schedule configs owned by the entity-awareness context (replaces
 * the standalone `AutoScheduleOnWikipediaArticleLinkedHandler` class —
 * ADR 0002 Phase 4a).
 */
export const entityAwarenessAutoScheduleConfigs: readonly AutoScheduleConfig[] = [
	{
		event: 'WikipediaArticleLinked',
		schedule: {
			providerId: WIKIPEDIA_AUTO_SCHEDULE_DEFAULTS.providerId,
			endpointId: WIKIPEDIA_AUTO_SCHEDULE_DEFAULTS.endpointId,
			cron: WIKIPEDIA_AUTO_SCHEDULE_DEFAULTS.cron,
			systemParamKey: 'wikipediaArticleId',
			paramsBuilder: (event: SharedKernel.DomainEvent) => {
				const e = event as EntityAwareness.WikipediaArticleLinked;
				return {
					project: e.wikipediaProject,
					article: e.slug,
					granularity: WIKIPEDIA_AUTO_SCHEDULE_DEFAULTS.granularity,
					start: WIKIPEDIA_AUTO_SCHEDULE_DEFAULTS.startToken,
					end: WIKIPEDIA_AUTO_SCHEDULE_DEFAULTS.endToken,
				};
			},
			systemParamsBuilder: (event: SharedKernel.DomainEvent) => {
				const e = event as EntityAwareness.WikipediaArticleLinked;
				return { organizationId: e.organizationId, wikipediaArticleId: e.articleId };
			},
		},
	},
];
