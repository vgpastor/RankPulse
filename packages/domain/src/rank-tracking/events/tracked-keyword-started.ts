import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { Device } from '../value-objects/device.js';
import type { TrackedKeywordId } from '../value-objects/identifiers.js';

export class TrackedKeywordStarted implements DomainEvent {
	readonly type = 'TrackedKeywordStarted';
	readonly trackedKeywordId: TrackedKeywordId;
	readonly projectId: ProjectId;
	readonly domain: string;
	readonly phrase: string;
	readonly country: string;
	readonly language: string;
	readonly device: Device;
	readonly occurredAt: Date;

	constructor(props: {
		trackedKeywordId: TrackedKeywordId;
		projectId: ProjectId;
		domain: string;
		phrase: string;
		country: string;
		language: string;
		device: Device;
		occurredAt: Date;
	}) {
		this.trackedKeywordId = props.trackedKeywordId;
		this.projectId = props.projectId;
		this.domain = props.domain;
		this.phrase = props.phrase;
		this.country = props.country;
		this.language = props.language;
		this.device = props.device;
		this.occurredAt = props.occurredAt;
	}
}
