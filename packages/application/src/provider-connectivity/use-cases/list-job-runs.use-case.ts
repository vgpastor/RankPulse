import type { ProviderConnectivity } from '@rankpulse/domain';

export interface JobRunView {
	id: string;
	definitionId: string;
	credentialId: string | null;
	status: ProviderConnectivity.JobRunStatus;
	startedAt: string;
	finishedAt: string | null;
	rawPayloadId: string | null;
	error: ProviderConnectivity.JobRunError | null;
}

const toView = (r: ProviderConnectivity.ProviderJobRun): JobRunView => ({
	id: r.id,
	definitionId: r.definitionId,
	credentialId: r.credentialId,
	status: r.status,
	startedAt: r.startedAt.toISOString(),
	finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
	rawPayloadId: r.rawPayloadId,
	error: r.error,
});

export interface ListJobRunsCommand {
	definitionId: string;
	limit?: number;
}

/**
 * Lists past runs for a job definition (most recent first). Used by the
 * operator to inspect schedule health: status, duration, and last error.
 */
export class ListJobRunsUseCase {
	constructor(private readonly runs: ProviderConnectivity.JobRunRepository) {}

	async execute(cmd: ListJobRunsCommand): Promise<JobRunView[]> {
		const list = await this.runs.listForDefinition(
			cmd.definitionId as ProviderConnectivity.ProviderJobDefinitionId,
			cmd.limit,
		);
		return list.map(toView);
	}
}
