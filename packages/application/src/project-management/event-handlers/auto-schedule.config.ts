import type { ProjectManagement, SharedKernel } from '@rankpulse/domain';
import type { AutoScheduleConfig, AutoScheduleSpec } from '../../_core/auto-schedule.js';
import type { SharedDeps } from '../../_core/module.js';

/**
 * Default scheduling parameters for the competitor-activity feeder. The
 * spec uses `competitorId` as the idempotency key — one schedule per
 * competitor regardless of how many times the event fires (re-adding the
 * same competitor is a no-op at the JobDefinition layer).
 *
 * Date tokens `{{today-N}}` / `{{today}}` are accepted by the provider's
 * Zod schema (literal regex) and resolved at dispatch time by
 * `resolveDateTokens` in the worker (BACKLOG #22).
 *
 * #179 follow-up: the second feeder (`dataforseo-backlinks-summary`) was
 * dropped because DataForSEO's Backlinks API requires a paid subscription
 * (~$100/mo) on top of the pay-as-you-go balance and the activity radar
 * already captures "competitor is shipping" via wayback snapshots alone.
 */
const WAYBACK_DEFAULTS = {
	providerId: 'wayback',
	endpointId: 'wayback-cdx-snapshots',
	cron: '0 5 * * 1', // Mondays 05:00 UTC
	// 365-day rolling window — captures roughly a year of shipping cadence.
	// `latestSnapshotAt` deltas don't need history beyond that for the
	// activity score, and a shorter window would miss seasonally quiet
	// competitors.
	from: '{{today-365}}',
	to: '{{today}}',
};

/**
 * Build the spec list for the `CompetitorAdded` event. One feeder is
 * scheduled per competitor (domain-level, NO per-locale fan-out):
 *
 *  • `wayback-cdx-snapshots` (free, ~30 req/s rate limit)
 *
 * Ingests into `competitor_activity_observations` keyed by
 * `(competitor_id, source)`. Idempotency key is `competitorId` —
 * re-firing the event (e.g. via competitor-suggestion promotion) MUST
 * NOT create a duplicate schedule. `ScheduleEndpointFetchUseCase` looks
 * up `params[systemParamKey]` via a string `equals` match, so we stamp
 * it into both `params` and `systemParams` for the lookup.
 */
const buildCompetitorAddedSpecs = async (
	event: SharedKernel.DomainEvent,
	_deps: SharedDeps,
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
			// Wayback CDX `CdxSnapshotsParams` requires `domain`, `from`, `to`
			// (not `target` — that's the DataForSEO contract). Mismatch here
			// caused #185 review P0-1 (Zod safeParse fails → InvalidInputError
			// → handler's catch swallows it → schedule never created).
			paramsBuilder: () => ({
				domain: competitorDomain,
				from: WAYBACK_DEFAULTS.from,
				to: WAYBACK_DEFAULTS.to,
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
