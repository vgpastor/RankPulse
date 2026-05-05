import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { TrackedPage } from '../entities/tracked-page.js';
import type { TrackedPageId } from '../value-objects/identifiers.js';
import type { PageUrl } from '../value-objects/page-url.js';
import type { PageSpeedStrategy } from '../value-objects/strategy.js';

export interface TrackedPageRepository {
	save(page: TrackedPage): Promise<void>;
	findById(id: TrackedPageId): Promise<TrackedPage | null>;
	findByTuple(projectId: ProjectId, url: PageUrl, strategy: PageSpeedStrategy): Promise<TrackedPage | null>;
	listForProject(projectId: ProjectId): Promise<readonly TrackedPage[]>;
	delete(id: TrackedPageId): Promise<void>;
}
