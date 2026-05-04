import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { TrackedKeywordId } from '../value-objects/identifiers.js';

export class KeywordEnteredTopTen implements DomainEvent {
	readonly type = 'KeywordEnteredTopTen';
	readonly trackedKeywordId: TrackedKeywordId;
	readonly projectId: ProjectId;
	readonly phrase: string;
	readonly currentPosition: number;
	readonly occurredAt: Date;

	constructor(props: {
		trackedKeywordId: TrackedKeywordId;
		projectId: ProjectId;
		phrase: string;
		currentPosition: number;
		occurredAt: Date;
	}) {
		this.trackedKeywordId = props.trackedKeywordId;
		this.projectId = props.projectId;
		this.phrase = props.phrase;
		this.currentPosition = props.currentPosition;
		this.occurredAt = props.occurredAt;
	}
}
