import type { ProviderJobRun } from '../entities/provider-job-run.js';
import type { ProviderJobDefinitionId, ProviderJobRunId } from '../value-objects/identifiers.js';

export interface JobRunRepository {
	save(run: ProviderJobRun): Promise<void>;
	findById(id: ProviderJobRunId): Promise<ProviderJobRun | null>;
	listForDefinition(
		definitionId: ProviderJobDefinitionId,
		limit?: number,
	): Promise<readonly ProviderJobRun[]>;
}
