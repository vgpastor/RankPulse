import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { TrackedPageId } from '../value-objects/identifiers.js';
import type { PageSpeedStrategy } from '../value-objects/strategy.js';

export class TrackedPageAdded implements DomainEvent {
	readonly type = 'TrackedPageAdded';
	readonly trackedPageId: TrackedPageId;
	readonly organizationId: OrganizationId;
	readonly projectId: ProjectId;
	readonly url: string;
	readonly strategy: PageSpeedStrategy;
	readonly occurredAt: Date;

	constructor(props: {
		trackedPageId: TrackedPageId;
		organizationId: OrganizationId;
		projectId: ProjectId;
		url: string;
		strategy: PageSpeedStrategy;
		occurredAt: Date;
	}) {
		this.trackedPageId = props.trackedPageId;
		this.organizationId = props.organizationId;
		this.projectId = props.projectId;
		this.url = props.url;
		this.strategy = props.strategy;
		this.occurredAt = props.occurredAt;
	}
}
