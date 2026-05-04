import type { KeywordList } from '../entities/keyword-list.js';
import type { KeywordListId, ProjectId } from '../value-objects/identifiers.js';

export interface KeywordListRepository {
	save(list: KeywordList): Promise<void>;
	findById(id: KeywordListId): Promise<KeywordList | null>;
	listForProject(projectId: ProjectId): Promise<readonly KeywordList[]>;
}
