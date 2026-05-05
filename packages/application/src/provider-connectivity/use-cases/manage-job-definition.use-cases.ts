import { type ProjectManagement, ProviderConnectivity } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface JobDefinitionView {
	id: string;
	projectId: string;
	providerId: string;
	endpointId: string;
	params: Record<string, unknown>;
	cron: string;
	credentialOverrideId: string | null;
	enabled: boolean;
	lastRunAt: string | null;
	createdAt: string;
}

const toView = (d: ProviderConnectivity.ProviderJobDefinition): JobDefinitionView => ({
	id: d.id,
	projectId: d.projectId,
	providerId: d.providerId.value,
	endpointId: d.endpointId.value,
	params: { ...d.params },
	cron: d.cron.value,
	credentialOverrideId: d.credentialOverrideId,
	enabled: d.enabled,
	lastRunAt: d.lastRunAt ? d.lastRunAt.toISOString() : null,
	createdAt: d.createdAt.toISOString(),
});

export class ListJobDefinitionsUseCase {
	constructor(private readonly definitions: ProviderConnectivity.JobDefinitionRepository) {}

	async execute(projectId: string): Promise<JobDefinitionView[]> {
		const rows = await this.definitions.listForProject(projectId as ProjectManagement.ProjectId);
		return rows.map(toView);
	}
}

export class GetJobDefinitionUseCase {
	constructor(private readonly definitions: ProviderConnectivity.JobDefinitionRepository) {}

	async execute(definitionId: string): Promise<JobDefinitionView> {
		const def = await this.definitions.findById(definitionId as ProviderConnectivity.ProviderJobDefinitionId);
		if (!def) throw new NotFoundError(`Job definition ${definitionId} not found`);
		return toView(def);
	}
}

export interface UpdateJobDefinitionCommand {
	definitionId: string;
	cron?: string;
	params?: Record<string, unknown>;
	enabled?: boolean;
}

export class UpdateJobDefinitionUseCase {
	constructor(
		private readonly definitions: ProviderConnectivity.JobDefinitionRepository,
		private readonly scheduler: ProviderConnectivity.JobScheduler,
	) {}

	async execute(cmd: UpdateJobDefinitionCommand): Promise<JobDefinitionView> {
		const def = await this.definitions.findById(
			cmd.definitionId as ProviderConnectivity.ProviderJobDefinitionId,
		);
		if (!def) throw new NotFoundError(`Job definition ${cmd.definitionId} not found`);

		// Unregister BEFORE mutating so BullMQ removes the repeatable using the
		// old cron pattern; a new register() afterwards (re-)installs it under
		// the new pattern.
		await this.scheduler.unregister(def);

		if (cmd.cron !== undefined) def.updateCron(ProviderConnectivity.CronExpression.create(cmd.cron));
		if (cmd.params !== undefined) def.updateParams(cmd.params);
		if (cmd.enabled === true) def.enable();
		if (cmd.enabled === false) def.disable();

		await this.definitions.save(def);
		await this.scheduler.register(def);
		return toView(def);
	}
}

export class DeleteJobDefinitionUseCase {
	constructor(
		private readonly definitions: ProviderConnectivity.JobDefinitionRepository,
		private readonly scheduler: ProviderConnectivity.JobScheduler,
	) {}

	async execute(definitionId: string): Promise<void> {
		const def = await this.definitions.findById(definitionId as ProviderConnectivity.ProviderJobDefinitionId);
		if (!def) throw new NotFoundError(`Job definition ${definitionId} not found`);
		await this.scheduler.unregister(def);
		await this.definitions.delete(def.id);
	}
}
