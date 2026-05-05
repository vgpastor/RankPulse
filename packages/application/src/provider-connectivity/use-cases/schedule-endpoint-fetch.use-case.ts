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
		const finalParams: Record<string, unknown> = { ...validatedParams, ...(cmd.systemParams ?? {}) };

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
