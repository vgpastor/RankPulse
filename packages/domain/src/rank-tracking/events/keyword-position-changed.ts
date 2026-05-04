import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { TrackedKeywordId } from '../value-objects/identifiers.js';

export class KeywordPositionChanged implements DomainEvent {
	readonly type = 'KeywordPositionChanged';
	readonly trackedKeywordId: TrackedKeywordId;
	readonly projectId: ProjectId;
	readonly phrase: string;
	readonly previousPosition: number | null;
	readonly currentPosition: number | null;
	readonly delta: number | null;
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
		this.delta =
			props.previousPosition !== null && props.currentPosition !== null
				? props.currentPosition - props.previousPosition
				: null;
		this.occurredAt = props.occurredAt;
	}
}
