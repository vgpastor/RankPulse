import type { ProjectManagement, SharedKernel } from '@rankpulse/domain';
import type { AutoScheduleConfig, AutoScheduleSpec } from '../../_core/auto-schedule.js';

/**
 * Default scheduling parameters for the competitor-activity feeders. Crons
 * spread across Monday morning so the per-provider rate limit doesn't
 * reject runs that all fire at the same second.
 *
 * Each spec uses `competitorId` as the idempotency key — one schedule per
 * competitor regardless of how many times the event fires (re-adding the
 * same competitor is a no-op at the JobDefinition layer).
 */
const WAYBACK_DEFAULTS = {
	providerId: 'wayback',
	endpointId: 'wayback-cdx-snapshots',
	cron: '0 5 * * 1', // Mondays 05:00 UTC
};

const BACKLINKS_DEFAULTS = {
	providerId: 'dataforseo',
	endpointId: 'dataforseo-backlinks-summary',
	cron: '0 6 * * 1', // Mondays 06:00 UTC (1h offset from wayback)
};

/**
 * Build the spec list for the `CompetitorAdded` event. Two feeders are
 * scheduled per competitor — both domain-level (NO per-locale fan-out):
 *
 *  • `wayback-cdx-snapshots` (free, ~30 req/s rate limit)
 *  • `dataforseo-backlinks-summary` (~$0.02 per call, weekly cadence)
 *
 * Both ingest into `competitor_activity_observations` keyed by
 * `(competitor_id, source)`, so the cockpit panel can show "snapshots +
 * backlinks" rollups without further joining.
 *
 * Idempotency key is `competitorId` for both — re-firing the event
 * (e.g. via competitor-suggestion promotion) MUST NOT create a duplicate
 * schedule. `ScheduleEndpointFetchUseCase` looks up
 * `params[systemParamKey]` via a string `equals` match, so we stamp it
 * into both `params` and `systemParams` for the lookup.
 */
const buildCompetitorAddedSpecs = async (
	event: SharedKernel.DomainEvent,
): Promise<readonly AutoScheduleSpec[]> => {
	if (event.type !== 'project-management.CompetitorAdded') return [];
	const e = event as ProjectManagement.CompetitorAdded;

	const competitorId = e.competitorId;
	const competitorDomain = e.domain;

	return [
		{
			providerId: WAYBACK_DEFAULTS.providerId,
			endpointId: WAYBACK_DEFAULTS.endpointId,
			cron: WAYBACK_DEFAULTS.cron,
			systemParamKey: 'competitorId',
			paramsBuilder: () => ({
				target: competitorDomain,
				competitorId,
			}),
			systemParamsBuilder: () => ({
				competitorId,
			}),
		},
		{
			providerId: BACKLINKS_DEFAULTS.providerId,
			endpointId: BACKLINKS_DEFAULTS.endpointId,
			cron: BACKLINKS_DEFAULTS.cron,
			systemParamKey: 'competitorId',
			paramsBuilder: () => ({
				target: competitorDomain,
				competitorId,
			}),
			systemParamsBuilder: () => ({
				competitorId,
			}),
		},
	];
};

/**
 * Auto-schedule configs owned by project-management. Closes the
 * "Auto-Schedule handler should have set this" runtime expectation that
 * the wayback + backlinks ingest handlers in [main.ts:256–296] rely on
 * for `systemParams.competitorId` (issues #181, #184).
 *
 * Why project-management and NOT competitor-intelligence: the underlying
 * use cases (`RecordCompetitorWaybackSnapshot`,
 * `RecordCompetitorBacklinksProfile`) and the
 * `competitor_activity_observations` table both live in
 * project-management. Competitor-intelligence owns the SERP-level
 * keyword analytics (ranked-keywords, domain-intersection), which is a
 * different bounded context.
 */
export const projectManagementAutoScheduleConfigs: readonly AutoScheduleConfig[] = [
	{
		event: 'project-management.CompetitorAdded',
		dynamicSchedules: buildCompetitorAddedSpecs,
	},
];
