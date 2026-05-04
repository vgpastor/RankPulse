import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { TrackedKeyword } from '../entities/tracked-keyword.js';
import type { TrackedKeywordId } from '../value-objects/identifiers.js';

export interface TrackedKeywordRepository {
	save(tracked: TrackedKeyword): Promise<void>;
	findById(id: TrackedKeywordId): Promise<TrackedKeyword | null>;
	findExisting(input: {
		projectId: ProjectId;
		domain: string;
		phrase: string;
		country: string;
		language: string;
		device: string;
	}): Promise<TrackedKeyword | null>;
	listForProject(projectId: ProjectId): Promise<readonly TrackedKeyword[]>;
	listForOrganization(orgId: OrganizationId): Promise<readonly TrackedKeyword[]>;
}
