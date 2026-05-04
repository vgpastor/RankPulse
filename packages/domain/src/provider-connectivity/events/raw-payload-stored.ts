import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { RawPayloadId } from '../value-objects/identifiers.js';

export class RawPayloadStored implements DomainEvent {
	readonly type = 'RawPayloadStored';
	readonly rawPayloadId: RawPayloadId;
	readonly providerId: string;
	readonly endpointId: string;
	readonly requestHash: string;
	readonly occurredAt: Date;

	constructor(props: {
		rawPayloadId: RawPayloadId;
		providerId: string;
		endpointId: string;
		requestHash: string;
		occurredAt: Date;
	}) {
		this.rawPayloadId = props.rawPayloadId;
		this.providerId = props.providerId;
		this.endpointId = props.endpointId;
		this.requestHash = props.requestHash;
		this.occurredAt = props.occurredAt;
	}
}
