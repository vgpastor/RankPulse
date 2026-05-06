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
 * Cross-context system-param resolver.
 *
 * BACKLOG bug #50 — some endpoints require an internal entity ID alongside
 * the user-facing params (e.g. `gsc-search-analytics` needs `gscPropertyId`
 * to ingest results into the right hypertable row). Hard-coding that lookup
 * inside this use case would couple `provider-connectivity` to every other
 * bounded context. Instead, expose a port and let composition wire in
 * resolvers per provider/endpoint pair. Each resolver returns either:
 *   - an object of system-params to merge, OR
 *   - {} when the resolver doesn't apply to this command, OR
 *   - throws `InvalidInputError` / `NotFoundError` when the prerequisite
 *     entity is missing (caller has to link the entity first).
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

		// Run cross-context resolvers (e.g. resolve gscPropertyId from siteUrl).
		// Empty list in tests / when nothing is wired — the loop simply no-ops.
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
