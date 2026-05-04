import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { PortfolioId, ProjectId } from '../value-objects/identifiers.js';
import type { ProjectKind } from '../value-objects/project-kind.js';

export class ProjectCreated implements DomainEvent {
	readonly type = 'project-management.ProjectCreated';
	readonly occurredAt: Date;
	readonly projectId: ProjectId;
	readonly organizationId: OrganizationId;
	readonly portfolioId: PortfolioId | null;
	readonly primaryDomain: string;
	readonly kind: ProjectKind;

	constructor(input: {
		projectId: ProjectId;
		organizationId: OrganizationId;
		portfolioId: PortfolioId | null;
		primaryDomain: string;
		kind: ProjectKind;
		occurredAt: Date;
	}) {
		this.projectId = input.projectId;
		this.organizationId = input.organizationId;
		this.portfolioId = input.portfolioId;
		this.primaryDomain = input.primaryDomain;
		this.kind = input.kind;
		this.occurredAt = input.occurredAt;
	}
}
