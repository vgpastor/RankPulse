import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { KeywordListId, ProjectId } from '../value-objects/identifiers.js';

export class KeywordsAdded implements DomainEvent {
	readonly type = 'project-management.KeywordsAdded';
	readonly occurredAt: Date;
	readonly keywordListId: KeywordListId;
	readonly projectId: ProjectId;
	readonly phrases: readonly string[];

	constructor(input: {
		keywordListId: KeywordListId;
		projectId: ProjectId;
		phrases: readonly string[];
		occurredAt: Date;
	}) {
		this.keywordListId = input.keywordListId;
		this.projectId = input.projectId;
		this.phrases = input.phrases;
		this.occurredAt = input.occurredAt;
	}
}
