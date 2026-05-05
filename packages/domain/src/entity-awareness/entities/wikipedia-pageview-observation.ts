import { InvalidInputError } from '@rankpulse/shared';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { WikipediaArticleId } from '../value-objects/identifiers.js';

export interface WikipediaPageviewObservationProps {
	articleId: WikipediaArticleId;
	projectId: ProjectId;
	observedAt: Date;
	views: number;
	access: string;
	agent: string;
	granularity: string;
}

/**
 * Immutable value-like row in the time-series store. No domain events
 * (per-row events would fan out massively for batches); the
 * IngestWikipediaPageviewsUseCase publishes a single batch summary
 * event instead.
 */
export class WikipediaPageviewObservation {
	private constructor(private readonly props: WikipediaPageviewObservationProps) {}

	static record(input: WikipediaPageviewObservationProps): WikipediaPageviewObservation {
		if (!Number.isFinite(input.views) || input.views < 0) {
			throw new InvalidInputError('views must be a non-negative finite number');
		}
		return new WikipediaPageviewObservation({ ...input, views: Math.round(input.views) });
	}

	static rehydrate(props: WikipediaPageviewObservationProps): WikipediaPageviewObservation {
		return new WikipediaPageviewObservation(props);
	}

	get articleId(): WikipediaArticleId {
		return this.props.articleId;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get observedAt(): Date {
		return this.props.observedAt;
	}
	get views(): number {
		return this.props.views;
	}
	get access(): string {
		return this.props.access;
	}
	get agent(): string {
		return this.props.agent;
	}
	get granularity(): string {
		return this.props.granularity;
	}
}
