import type { SearchConsoleInsights, SharedKernel } from '@rankpulse/domain';
import type { ScheduleEndpointFetchUseCase } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';

/**
 * Minimal logger port for cross-cutting orchestration handlers in the
 * application layer. Composition root wires it to pino in production and to
 * a stub in tests. Kept tiny on purpose — only what the handler actually
 * needs.
 */
export interface EventHandlerLogger {
	info(meta: object, msg: string): void;
	error(meta: object, msg: string): void;
}

const NOOP_LOGGER: EventHandlerLogger = {
	info: () => {},
	error: () => {},
};

/**
 * Defaults for the auto-created GSC search-analytics JobDefinition.
 * Centralised so tests can lock the contract and the composition root
 * doesn't drift.
 *
 * Window:
 *  - `startDate: '{{today-30}}'` — GSC keeps 16 months of history but the
 *    rolling 30-day window is the operationally interesting one. Going
 *    longer would balloon the row count per fetch (rowLimit = 25k).
 *  - `endDate: '{{today-2}}'` — GSC has a ~2-day lag for fresh metrics.
 *    Querying yesterday returns mostly null rows.
 *
 * Cron is the descriptor's `defaultCron` (`0 5 * * *` = daily 05:00 UTC),
 * timed after GSC's nightly aggregation completes.
 */
export const GSC_AUTO_SCHEDULE_DEFAULTS = {
	providerId: 'google-search-console',
	endpointId: 'gsc-search-analytics',
	cron: '0 5 * * *',
	dimensions: ['date', 'query', 'page'] as const,
	rowLimit: 25_000,
	startDateToken: '{{today-30}}',
	endDateToken: '{{today-2}}',
};

/**
 * BACKLOG #23 / #21 — auto-schedule daily fetch when a GSC property is
 * linked.
 *
 * Listens to the domain event `GscPropertyLinked` and invokes
 * `ScheduleEndpointFetchUseCase` with the daily-cron defaults so the
 * worker starts persisting search-analytics rows immediately. The
 * processor (BACKLOG #22) resolves the relative date tokens at every
 * tick, so the rolling 30-day window stays current without any further
 * intervention.
 *
 * Failure mode: scheduling errors are LOGGED, not propagated. The link
 * is already persisted; failing the API call would leave a property in
 * the DB and a 500 to the caller. The operator can re-create the
 * schedule manually from the SchedulesPage if this fires.
 *
 * SOLID: this is a pure orchestrator — single responsibility (translate
 * domain event → schedule call), open for extension (more events can
 * trigger the same scheduling pattern), depends on the use-case
 * interface, not on Drizzle/BullMQ.
 */
export class AutoScheduleOnGscPropertyLinkedHandler {
	constructor(
		private readonly scheduleEndpointFetch: ScheduleEndpointFetchUseCase,
		private readonly logger: EventHandlerLogger = NOOP_LOGGER,
	) {}

	async handle(event: SharedKernel.DomainEvent): Promise<void> {
		// Defensive type narrowing — same publisher fans events of all types
		// to every listener; we only react to ours.
		if (event.type !== 'GscPropertyLinked') return;
		const { gscPropertyId, projectId, organizationId, siteUrl } =
			event as SearchConsoleInsights.GscPropertyLinked;

		try {
			const result = await this.scheduleEndpointFetch.execute({
				projectId,
				providerId: GSC_AUTO_SCHEDULE_DEFAULTS.providerId,
				endpointId: GSC_AUTO_SCHEDULE_DEFAULTS.endpointId,
				params: {
					siteUrl,
					startDate: GSC_AUTO_SCHEDULE_DEFAULTS.startDateToken,
					endDate: GSC_AUTO_SCHEDULE_DEFAULTS.endDateToken,
					dimensions: [...GSC_AUTO_SCHEDULE_DEFAULTS.dimensions],
					rowLimit: GSC_AUTO_SCHEDULE_DEFAULTS.rowLimit,
				},
				systemParams: { organizationId, gscPropertyId },
				cron: GSC_AUTO_SCHEDULE_DEFAULTS.cron,
				credentialOverrideId: null,
			});
			this.logger.info(
				{ gscPropertyId, definitionId: result.definitionId },
				'auto-scheduled daily GSC fetch on link',
			);
		} catch (err) {
			this.logger.error(
				{ gscPropertyId, err: err instanceof Error ? err.message : String(err) },
				'auto-schedule failed on GscPropertyLinked — operator must schedule manually',
			);
		}
	}
}
