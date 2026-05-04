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
	listForProject(projectId: ProjectId): Promise<readonly ProviderJobDefinition[]>;
}
