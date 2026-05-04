import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { CompetitorId, ProjectId } from '../value-objects/identifiers.js';

export class CompetitorAdded implements DomainEvent {
	readonly type = 'project-management.CompetitorAdded';
	readonly occurredAt: Date;
	readonly competitorId: CompetitorId;
	readonly projectId: ProjectId;
	readonly domain: string;
	readonly label: string;

	constructor(input: {
		competitorId: CompetitorId;
		projectId: ProjectId;
		domain: string;
		label: string;
		occurredAt: Date;
	}) {
		this.competitorId = input.competitorId;
		this.projectId = input.projectId;
		this.domain = input.domain;
		this.label = input.label;
		this.occurredAt = input.occurredAt;
	}
}
