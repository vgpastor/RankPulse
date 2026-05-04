import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { ProjectId } from '../value-objects/identifiers.js';

export class DomainAdded implements DomainEvent {
	readonly type = 'project-management.DomainAdded';
	readonly occurredAt: Date;
	readonly projectId: ProjectId;
	readonly domain: string;
	readonly kind: 'main' | 'subdomain' | 'alias';

	constructor(input: {
		projectId: ProjectId;
		domain: string;
		kind: 'main' | 'subdomain' | 'alias';
		occurredAt: Date;
	}) {
		this.projectId = input.projectId;
		this.domain = input.domain;
		this.kind = input.kind;
		this.occurredAt = input.occurredAt;
	}
}
