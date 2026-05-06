import { type ProjectManagement, ProviderConnectivity, type SharedKernel } from '@rankpulse/domain';
import { type Clock, type IdGenerator, InvalidInputError } from '@rankpulse/shared';

/**
 * Application-layer port over `ProviderRegistry.endpoint().paramsSchema` so
 * this use case stays decoupled from `@rankpulse/provider-core`. Returns the
 * normalized params (after Zod parsing — defaults applied, transforms run).
 */
export interface EndpointParamsValidator {
	validate(providerId: string, endpointId: string, params: unknown): Record<string, unknown>;
}

/**
 * Cross-context system-param resolver — fallback for bounded contexts that
 * haven't yet adopted the per-context Auto-Schedule handler pattern (ADR
 * 0001). Auto-schedule handlers populate `systemParams` directly when they
 * dispatch this use case, so the resolver loop is a no-op for those flows;
 * the loop still runs to support manual `POST /providers/.../schedule`
 * calls against contexts (Meta) that lack an auto-schedule handler.
 *
 * New bounded contexts SHOULD prefer the auto-schedule handler pattern;
 * the resolver port is kept here pending the Meta migration.
 */
export interface SystemParamResolver {
	resolve(input: {
		projectId: string;
		providerId: string;
		endpointId: string;
		params: Record<string, unknown>;
	}): Promise<Record<string, unknown>>;
}

export interface ScheduleEndpointFetchCommand {
	projectId: string;
	providerId: string;
	endpointId: string;
	/** User-provided params; validated against the endpoint's paramsSchema. */
	params: Record<string, unknown>;
	/**
	 * System-injected params merged AFTER validation (organizationId,
	 * trackedKeywordId, etc.). Bypasses paramsSchema strip behaviour because
	 * the descriptor's schema only describes the user surface; these keys are
	 * read by the worker for scoping/persistence and don't belong in the
	 * provider call payload.
	 */
	systemParams?: Record<string, unknown>;
	cron: string;
	credentialOverrideId?: string | null;
	/**
	 * Optional idempotency key. When provided, the use case looks up an
	 * existing JobDefinition for `(projectId, endpointId)` whose
	 * `params.<systemParamKey>` equals `systemParamValue`; if found, returns
	 * its definitionId without creating a duplicate. Used by per-context
	 * Auto-Schedule handlers so that re-emitting the link event (replay,
	 * reconnect, dual delivery) doesn't duplicate the schedule.
	 */
	idempotencyKey?: { systemParamKey: string; systemParamValue: string };
}

export interface ScheduleEndpointFetchResult {
	definitionId: string;
}

export class ScheduleEndpointFetchUseCase {
	constructor(
		private readonly definitions: ProviderConnectivity.JobDefinitionRepository,
		private readonly scheduler: ProviderConnectivity.JobScheduler,
		private readonly paramsValidator: EndpointParamsValidator,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
		private readonly events: SharedKernel.EventPublisher,
		private readonly systemParamResolvers: SystemParamResolver[] = [],
	) {}

	async execute(cmd: ScheduleEndpointFetchCommand): Promise<ScheduleEndpointFetchResult> {
		const providerId = ProviderConnectivity.ProviderId.create(cmd.providerId);
		const endpointId = ProviderConnectivity.EndpointId.create(cmd.endpointId);
		const cron = ProviderConnectivity.CronExpression.create(cmd.cron);
		const projectId = cmd.projectId as ProjectManagement.ProjectId;

		const validatedParams = this.paramsValidator.validate(providerId.value, endpointId.value, cmd.params);
		if (typeof validatedParams !== 'object' || validatedParams === null) {
			throw new InvalidInputError(
				`Endpoint ${endpointId.value} paramsSchema must resolve to an object, got ${typeof validatedParams}`,
			);
		}

		// Idempotency: if the caller supplied an idempotency key, return the
		// existing definitionId without creating a duplicate. This is what makes
		// auto-schedule handlers safe under event replay / reconnect.
		if (cmd.idempotencyKey) {
			const existing = await this.definitions.findByProjectEndpointAndSystemParam(
				projectId,
				endpointId,
				cmd.idempotencyKey.systemParamKey,
				cmd.idempotencyKey.systemParamValue,
			);
			if (existing) return { definitionId: existing.id };
		}

		// Run cross-context resolvers (Meta — pending migration to handler
		// pattern). No-op when the resolver list is empty.
		let resolvedSystemParams: Record<string, unknown> = { ...(cmd.systemParams ?? {}) };
		for (const resolver of this.systemParamResolvers) {
			const extra = await resolver.resolve({
				projectId: cmd.projectId,
				providerId: providerId.value,
				endpointId: endpointId.value,
				params: validatedParams,
			});
			resolvedSystemParams = { ...resolvedSystemParams, ...extra };
		}

		const finalParams: Record<string, unknown> = { ...validatedParams, ...resolvedSystemParams };

		const id = this.ids.generate() as ProviderConnectivity.ProviderJobDefinitionId;
		const definition = ProviderConnectivity.ProviderJobDefinition.schedule({
			id,
			projectId,
			providerId,
			endpointId,
			params: finalParams,
			cron,
			credentialOverrideId: cmd.credentialOverrideId
				? (cmd.credentialOverrideId as ProviderConnectivity.ProviderCredentialId)
				: null,
			now: this.clock.now(),
		});

		await this.definitions.save(definition);
		await this.scheduler.register(definition);
		await this.events.publish(definition.pullEvents());

		return { definitionId: id };
	}
}
