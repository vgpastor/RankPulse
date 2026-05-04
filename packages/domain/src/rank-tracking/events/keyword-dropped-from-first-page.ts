import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { TrackedKeywordId } from '../value-objects/identifiers.js';

export class KeywordDroppedFromFirstPage implements DomainEvent {
	readonly type = 'KeywordDroppedFromFirstPage';
	readonly trackedKeywordId: TrackedKeywordId;
	readonly projectId: ProjectId;
	readonly phrase: string;
	readonly previousPosition: number | null;
	readonly currentPosition: number | null;
	readonly occurredAt: Date;

	constructor(props: {
		trackedKeywordId: TrackedKeywordId;
		projectId: ProjectId;
		phrase: string;
		previousPosition: number | null;
		currentPosition: number | null;
		occurredAt: Date;
	}) {
		this.trackedKeywordId = props.trackedKeywordId;
		this.projectId = props.projectId;
		this.phrase = props.phrase;
		this.previousPosition = props.previousPosition;
		this.currentPosition = props.currentPosition;
		this.occurredAt = props.occurredAt;
	}
}
