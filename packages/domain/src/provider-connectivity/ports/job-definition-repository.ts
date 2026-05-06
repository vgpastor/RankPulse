import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { ProviderJobDefinition } from '../entities/provider-job-definition.js';
import type { EndpointId } from '../value-objects/endpoint-id.js';
import type { ProviderJobDefinitionId } from '../value-objects/identifiers.js';
import type { ProviderId } from '../value-objects/provider-id.js';

export interface JobDefinitionRepository {
	save(definition: ProviderJobDefinition): Promise<void>;
	findById(id: ProviderJobDefinitionId): Promise<ProviderJobDefinition | null>;
	findFor(
		projectId: ProjectId,
		providerId: ProviderId,
		endpointId: EndpointId,
		paramsHash: string,
	): Promise<ProviderJobDefinition | null>;
	/**
	 * Idempotency lookup for auto-schedule handlers.
	 *
	 * Returns the JobDefinition (if any) for `(projectId, endpointId)` whose
	 * `params.<systemParamKey>` equals `systemParamValue`. Used by
	 * `ScheduleEndpointFetchUseCase` to avoid duplicate creation when an
	 * entity-link event is replayed.
	 *
	 * Implementation note: query by `params->>{systemParamKey} = $value`.
	 * The current schema mixes user/system params in one JSONB column; the
	 * field is queryable but unindexed. Acceptable at current cardinality
	 * (≤ N projects × ≤ M entities per project).
	 */
	findByProjectEndpointAndSystemParam(
		projectId: ProjectId,
		endpointId: EndpointId,
		systemParamKey: string,
		systemParamValue: string,
	): Promise<ProviderJobDefinition | null>;
	listForProject(projectId: ProjectId): Promise<readonly ProviderJobDefinition[]>;
	delete(id: ProviderJobDefinitionId): Promise<void>;
}
