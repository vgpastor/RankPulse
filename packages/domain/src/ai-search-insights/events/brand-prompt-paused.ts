import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { BrandPromptId } from '../value-objects/identifiers.js';

export class BrandPromptPaused implements DomainEvent {
	readonly type = 'BrandPromptPaused';
	readonly brandPromptId: BrandPromptId;
	readonly projectId: ProjectId;
	readonly occurredAt: Date;

	constructor(props: { brandPromptId: BrandPromptId; projectId: ProjectId; occurredAt: Date }) {
		this.brandPromptId = props.brandPromptId;
		this.projectId = props.projectId;
		this.occurredAt = props.occurredAt;
	}
}
