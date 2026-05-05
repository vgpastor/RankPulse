import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { WikipediaArticleId } from '../value-objects/identifiers.js';

export class WikipediaArticleUnlinked implements DomainEvent {
	readonly type = 'WikipediaArticleUnlinked';
	readonly articleId: WikipediaArticleId;
	readonly projectId: ProjectId;
	readonly occurredAt: Date;

	constructor(props: { articleId: WikipediaArticleId; projectId: ProjectId; occurredAt: Date }) {
		this.articleId = props.articleId;
		this.projectId = props.projectId;
		this.occurredAt = props.occurredAt;
	}
}
