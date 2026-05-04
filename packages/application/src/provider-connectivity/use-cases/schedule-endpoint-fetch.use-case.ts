import { type ProjectManagement, ProviderConnectivity, type SharedKernel } from '@rankpulse/domain';
import type { Clock, IdGenerator } from '@rankpulse/shared';

export interface ScheduleEndpointFetchCommand {
	projectId: string;
	providerId: string;
	endpointId: string;
	params: Record<string, unknown>;
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
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: ScheduleEndpointFetchCommand): Promise<ScheduleEndpointFetchResult> {
		const providerId = ProviderConnectivity.ProviderId.create(cmd.providerId);
		const endpointId = ProviderConnectivity.EndpointId.create(cmd.endpointId);
		const cron = ProviderConnectivity.CronExpression.create(cmd.cron);
		const projectId = cmd.projectId as ProjectManagement.ProjectId;

		const id = this.ids.generate() as ProviderConnectivity.ProviderJobDefinitionId;
		const definition = ProviderConnectivity.ProviderJobDefinition.schedule({
			id,
			projectId,
			providerId,
			endpointId,
			params: cmd.params,
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
