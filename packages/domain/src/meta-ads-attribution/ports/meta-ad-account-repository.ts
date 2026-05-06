import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { MetaAdAccount } from '../entities/meta-ad-account.js';
import type { MetaAdAccountId } from '../value-objects/identifiers.js';

export interface MetaAdAccountRepository {
	save(account: MetaAdAccount): Promise<void>;
	findById(id: MetaAdAccountId): Promise<MetaAdAccount | null>;
	findByProjectAndHandle(projectId: ProjectId, adAccountHandle: string): Promise<MetaAdAccount | null>;
	listForProject(projectId: ProjectId): Promise<readonly MetaAdAccount[]>;
	listForOrganization(orgId: OrganizationId): Promise<readonly MetaAdAccount[]>;
}
