import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProviderJobRun } from '../entities/provider-job-run.js';
import type { ProviderJobDefinitionId, ProviderJobRunId } from '../value-objects/identifiers.js';

/** Succeeded runs in a window, split by whether they called upstream. */
export interface RunExecutionCounts {
	/** Runs that fetched from the provider — these produced usage entries. */
	billed: number;
	/** Runs that replayed a payload an earlier run had already fetched. */
	fromCache: number;
}

export interface JobRunRepository {
	save(run: ProviderJobRun): Promise<void>;
	/**
	 * Counts succeeded runs for an organization in [from, to). Pairs with
	 * `ApiUsageRepository.breakdown` to express what share of executions
	 * avoided an upstream call.
	 */
	countExecutions(organizationId: OrganizationId, from: Date, to: Date): Promise<RunExecutionCounts>;
	findById(id: ProviderJobRunId): Promise<ProviderJobRun | null>;
	listForDefinition(
		definitionId: ProviderJobDefinitionId,
		limit?: number,
	): Promise<readonly ProviderJobRun[]>;
}
