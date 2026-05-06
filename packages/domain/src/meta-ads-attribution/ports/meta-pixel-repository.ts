import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { MetaPixel } from '../entities/meta-pixel.js';
import type { MetaPixelId } from '../value-objects/identifiers.js';

export interface MetaPixelRepository {
	save(pixel: MetaPixel): Promise<void>;
	findById(id: MetaPixelId): Promise<MetaPixel | null>;
	findByProjectAndHandle(projectId: ProjectId, pixelHandle: string): Promise<MetaPixel | null>;
	listForProject(projectId: ProjectId): Promise<readonly MetaPixel[]>;
	listForOrganization(orgId: OrganizationId): Promise<readonly MetaPixel[]>;
}
