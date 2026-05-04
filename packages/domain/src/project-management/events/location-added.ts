import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { ProjectId } from '../value-objects/identifiers.js';

export class LocationAdded implements DomainEvent {
	readonly type = 'project-management.LocationAdded';
	readonly occurredAt: Date;
	readonly projectId: ProjectId;
	readonly country: string;
	readonly language: string;

	constructor(input: {
		projectId: ProjectId;
		country: string;
		language: string;
		occurredAt: Date;
	}) {
		this.projectId = input.projectId;
		this.country = input.country;
		this.language = input.language;
		this.occurredAt = input.occurredAt;
	}
}
