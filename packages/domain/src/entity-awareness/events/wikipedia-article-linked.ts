import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { WikipediaArticleId } from '../value-objects/identifiers.js';

export class WikipediaArticleLinked implements DomainEvent {
	readonly type = 'WikipediaArticleLinked';
	readonly articleId: WikipediaArticleId;
	readonly organizationId: OrganizationId;
	readonly projectId: ProjectId;
	readonly wikipediaProject: string;
	readonly slug: string;
	readonly occurredAt: Date;

	constructor(props: {
		articleId: WikipediaArticleId;
		organizationId: OrganizationId;
		projectId: ProjectId;
		wikipediaProject: string;
		slug: string;
		occurredAt: Date;
	}) {
		this.articleId = props.articleId;
		this.organizationId = props.organizationId;
		this.projectId = props.projectId;
		this.wikipediaProject = props.wikipediaProject;
		this.slug = props.slug;
		this.occurredAt = props.occurredAt;
	}
}
