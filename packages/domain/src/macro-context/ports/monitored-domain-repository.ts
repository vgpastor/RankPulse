import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { MonitoredDomain } from '../entities/monitored-domain.js';
import type { MonitoredDomainId } from '../value-objects/identifiers.js';

export interface MonitoredDomainRepository {
	save(monitoredDomain: MonitoredDomain): Promise<void>;
	findById(id: MonitoredDomainId): Promise<MonitoredDomain | null>;
	findByProjectAndDomain(projectId: ProjectId, domain: string): Promise<MonitoredDomain | null>;
	listForProject(projectId: ProjectId): Promise<readonly MonitoredDomain[]>;
	listForOrganization(orgId: OrganizationId): Promise<readonly MonitoredDomain[]>;
}
