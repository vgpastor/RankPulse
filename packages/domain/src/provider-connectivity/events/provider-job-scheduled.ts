import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { ProviderJobDefinitionId } from '../value-objects/identifiers.js';

export class ProviderJobScheduled implements DomainEvent {
	readonly type = 'ProviderJobScheduled';
	readonly definitionId: ProviderJobDefinitionId;
	readonly projectId: ProjectId;
	readonly providerId: string;
	readonly endpointId: string;
	readonly cron: string;
	readonly occurredAt: Date;

	constructor(props: {
		definitionId: ProviderJobDefinitionId;
		projectId: ProjectId;
		providerId: string;
		endpointId: string;
		cron: string;
		occurredAt: Date;
	}) {
		this.definitionId = props.definitionId;
		this.projectId = props.projectId;
		this.providerId = props.providerId;
		this.endpointId = props.endpointId;
		this.cron = props.cron;
		this.occurredAt = props.occurredAt;
	}
}
