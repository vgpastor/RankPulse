import { type ProviderConnectivity } from '@rankpulse/domain';
import { type IdGenerator, NotFoundError } from '@rankpulse/shared';

export interface TriggerJobDefinitionRunCommand {
	definitionId: string;
}

export interface TriggerJobDefinitionRunResult {
	runId: string;
	definitionId: string;
}

/**
 * Enqueues a one-off run of an existing job definition, bypassing the cron
 * schedule. Returns the runId that can be used to correlate the resulting
 * provider_job_run record.
 */
export class TriggerJobDefinitionRunUseCase {
	constructor(
		private readonly definitions: ProviderConnectivity.JobDefinitionRepository,
		private readonly scheduler: ProviderConnectivity.JobScheduler,
		private readonly ids: IdGenerator,
	) {}

	async execute(cmd: TriggerJobDefinitionRunCommand): Promise<TriggerJobDefinitionRunResult> {
		const definition = await this.definitions.findById(
			cmd.definitionId as ProviderConnectivity.ProviderJobDefinitionId,
		);
		if (!definition) {
			throw new NotFoundError(`Job definition ${cmd.definitionId} not found`);
		}
		const runId = this.ids.generate();
		await this.scheduler.enqueueOnce(definition, runId);
		return { runId, definitionId: definition.id };
	}
}
