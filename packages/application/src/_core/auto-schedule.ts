import type { SharedKernel } from '@rankpulse/domain';
import type { EventHandler, SharedDeps } from './module.js';

/**
 * Configures one auto-schedule handler. Each config produces one
 * EventHandler. Three fan-out modes are supported:
 *
 *   - `schedule`: single schedule (most common — GSC, Ga4, Wikipedia, ...).
 *   - `schedules`: static list of schedules per event (Meta ad account
 *     fans into ads-insights + custom-audiences).
 *   - `dynamicSchedules`: schedule list computed from the event + deps
 *     (AI Brand Radar fans 4 providers × N project locales — depends on
 *     reading the project's locations from the repo).
 *
 * Exactly one of the three MUST be set; runtime validation throws if
 * none or more than one is provided.
 */
export interface AutoScheduleConfig {
	readonly event: string;
	readonly schedule?: AutoScheduleSpec;
	readonly schedules?: readonly AutoScheduleSpec[];
	readonly dynamicSchedules?: (
		event: SharedKernel.DomainEvent,
		deps: SharedDeps,
	) => Promise<readonly AutoScheduleSpec[]>;
}

export interface AutoScheduleSpec {
	readonly providerId: string;
	readonly endpointId: string;
	readonly cron: string;
	readonly systemParamKey: string;
	readonly paramsBuilder: (event: SharedKernel.DomainEvent) => Record<string, unknown>;
	readonly systemParamsBuilder: (event: SharedKernel.DomainEvent) => Record<string, unknown>;
}

interface ScheduleEndpointFetchResult {
	readonly definitionId: string;
}

interface ScheduleEndpointFetchExecutor {
	execute(input: {
		projectId: string;
		providerId: string;
		endpointId: string;
		params: Record<string, unknown>;
		systemParams: Record<string, unknown>;
		cron: string;
		credentialOverrideId: null;
		idempotencyKey: { systemParamKey: string; systemParamValue: string };
	}): Promise<ScheduleEndpointFetchResult>;
}

interface ChildLogger {
	info(meta: object, msg: string): void;
	error(meta: object, msg: string): void;
}

interface RootLogger extends ChildLogger {
	child(bindings: object): ChildLogger;
}

interface AutoScheduleDeps extends SharedDeps {
	readonly scheduleEndpointFetch: ScheduleEndpointFetchExecutor;
	readonly logger: RootLogger;
}

export function buildAutoScheduleHandlers(
	deps: SharedDeps,
	configs: readonly AutoScheduleConfig[],
): EventHandler[] {
	const adeps = deps as AutoScheduleDeps;
	return configs.map((config) => buildOne(adeps, config));
}

function buildOne(deps: AutoScheduleDeps, config: AutoScheduleConfig): EventHandler {
	const modes = [config.schedule, config.schedules, config.dynamicSchedules].filter((x) => x !== undefined);
	if (modes.length !== 1) {
		throw new Error(
			`AutoScheduleConfig for event '${config.event}' must specify exactly one of {schedule, schedules, dynamicSchedules}; got ${modes.length}`,
		);
	}

	const log = deps.logger.child({ subsystem: 'auto-schedule', event: config.event });

	return {
		events: [config.event] as const,
		async handle(event: SharedKernel.DomainEvent): Promise<void> {
			if (event.type !== config.event) return;

			const specs: readonly AutoScheduleSpec[] = config.schedule
				? [config.schedule]
				: config.schedules
					? config.schedules
					: await config.dynamicSchedules!(event, deps);

			await Promise.all(
				specs.map(async (spec) => {
					const params = spec.paramsBuilder(event);
					const systemParams = spec.systemParamsBuilder(event);
					const idempotencyValue = systemParams[spec.systemParamKey];
					if (typeof idempotencyValue !== 'string') {
						log.error(
							{ spec: { providerId: spec.providerId, endpointId: spec.endpointId } },
							'systemParamsBuilder did not produce a string value for systemParamKey; skipping schedule',
						);
						return;
					}
					try {
						// projectId is read off the event by convention — every domain event that
						// triggers an auto-schedule carries one. Double-cast through unknown because
						// SharedKernel.DomainEvent is intentionally narrow and TS won't accept a
						// direct overlap. Schedule specs that target events without projectId will
						// fail at execute() time with a clear payload error.
						const result = await deps.scheduleEndpointFetch.execute({
							projectId: (event as unknown as { projectId: string }).projectId,
							providerId: spec.providerId,
							endpointId: spec.endpointId,
							params,
							systemParams,
							cron: spec.cron,
							credentialOverrideId: null,
							idempotencyKey: { systemParamKey: spec.systemParamKey, systemParamValue: idempotencyValue },
						});
						log.info(
							{ providerId: spec.providerId, endpointId: spec.endpointId, definitionId: result.definitionId },
							'auto-scheduled fetch on link',
						);
					} catch (err) {
						log.error(
							{
								providerId: spec.providerId,
								endpointId: spec.endpointId,
								err: err instanceof Error ? err.message : String(err),
							},
							'auto-schedule failed — operator must schedule manually',
						);
					}
				}),
			);
		},
	};
}
