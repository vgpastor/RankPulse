import type { ExperienceAnalytics, SharedKernel } from '@rankpulse/domain';
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
 * Auto-schedule daily Clarity data-export fetch when a project is linked.
 *
 * Listens to `ClarityProjectLinked` and invokes `ScheduleEndpointFetchUseCase`
 * with the daily-cron defaults so the worker starts persisting per-day UX
 * behavioral metrics immediately. Idempotency on `clarityProjectId` so
 * re-emission of the link event (replay, reconnect, dual delivery) returns
 * the existing definitionId instead of creating a duplicate.
 *
 * Failure mode: scheduling errors are LOGGED, not propagated. The link is
 * already persisted; failing the API call would leave a half-state.
 */
export class AutoScheduleOnClarityProjectLinkedHandler {
	constructor(
		private readonly scheduleEndpointFetch: ScheduleEndpointFetchUseCase,
		private readonly logger: EventHandlerLogger = NOOP_LOGGER,
	) {}

	async handle(event: SharedKernel.DomainEvent): Promise<void> {
		// Defensive type narrowing — same publisher fans events of all types
		// to every listener; we only react to ours.
		if (event.type !== 'ClarityProjectLinked') return;
		const { clarityProjectId, projectId, organizationId } = event as ExperienceAnalytics.ClarityProjectLinked;

		try {
			const result = await this.scheduleEndpointFetch.execute({
				projectId,
				providerId: CLARITY_AUTO_SCHEDULE_DEFAULTS.providerId,
				endpointId: CLARITY_AUTO_SCHEDULE_DEFAULTS.endpointId,
				params: {
					numOfDays: CLARITY_AUTO_SCHEDULE_DEFAULTS.numOfDays,
				},
				systemParams: { organizationId, clarityProjectId },
				cron: CLARITY_AUTO_SCHEDULE_DEFAULTS.cron,
				credentialOverrideId: null,
				idempotencyKey: {
					systemParamKey: 'clarityProjectId',
					systemParamValue: clarityProjectId,
				},
			});
			this.logger.info(
				{ clarityProjectId, definitionId: result.definitionId },
				'auto-scheduled daily Clarity export on project link',
			);
		} catch (err) {
			this.logger.error(
				{ clarityProjectId, err: err instanceof Error ? err.message : String(err) },
				'auto-schedule failed on ClarityProjectLinked — operator must schedule manually',
			);
		}
	}
}
