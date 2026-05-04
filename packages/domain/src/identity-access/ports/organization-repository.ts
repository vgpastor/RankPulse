import type { Organization } from '../entities/organization.js';
import type { OrganizationId } from '../value-objects/identifiers.js';

export interface OrganizationRepository {
	save(org: Organization): Promise<void>;
	findById(id: OrganizationId): Promise<Organization | null>;
	findBySlug(slug: string): Promise<Organization | null>;
}
