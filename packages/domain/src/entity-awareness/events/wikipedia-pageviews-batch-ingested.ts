import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { WikipediaArticleId } from '../value-objects/identifiers.js';

/**
 * One event per ingest call (NOT per row), mirroring the
 * GscPerformanceBatchIngested pattern. Subscribers aggregate downstream
 * — emitting per-row events would fan-out N×ingestcalls events with no
 * additional information.
 */
export class WikipediaPageviewsBatchIngested implements DomainEvent {
	readonly type = 'WikipediaPageviewsBatchIngested';
	readonly articleId: WikipediaArticleId;
	readonly projectId: ProjectId;
	readonly rowsCount: number;
	readonly totalViews: number;
	readonly occurredAt: Date;

	constructor(props: {
		articleId: WikipediaArticleId;
		projectId: ProjectId;
		rowsCount: number;
		totalViews: number;
		occurredAt: Date;
	}) {
		this.articleId = props.articleId;
		this.projectId = props.projectId;
		this.rowsCount = props.rowsCount;
		this.totalViews = props.totalViews;
		this.occurredAt = props.occurredAt;
	}
}
