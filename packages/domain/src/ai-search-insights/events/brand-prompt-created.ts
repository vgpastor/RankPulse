import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { BrandPromptId } from '../value-objects/identifiers.js';
import type { PromptKind } from '../value-objects/prompt-kind.js';

/**
 * Emitted when a user registers a new BrandPrompt. The auto-schedule handler
 * subscribes to this and creates one JobDefinition per (LocationLanguage of
 * the project × connected AI provider credential) — matching the issue #56
 * recommendation of letting domain events drive the scheduling fan-out.
 */
export class BrandPromptCreated implements DomainEvent {
	readonly type = 'BrandPromptCreated';
	readonly brandPromptId: BrandPromptId;
	readonly organizationId: OrganizationId;
	readonly projectId: ProjectId;
	readonly text: string;
	readonly kind: PromptKind;
	readonly occurredAt: Date;

	constructor(props: {
		brandPromptId: BrandPromptId;
		organizationId: OrganizationId;
		projectId: ProjectId;
		text: string;
		kind: PromptKind;
		occurredAt: Date;
	}) {
		this.brandPromptId = props.brandPromptId;
		this.organizationId = props.organizationId;
		this.projectId = props.projectId;
		this.text = props.text;
		this.kind = props.kind;
		this.occurredAt = props.occurredAt;
	}
}
