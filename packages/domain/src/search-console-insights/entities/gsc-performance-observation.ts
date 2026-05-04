import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import { GscPerformanceIngested } from '../events/gsc-performance-ingested.js';
import type { GscObservationId, GscPropertyId } from '../value-objects/identifiers.js';
import type { PerformanceMetrics } from '../value-objects/performance-metrics.js';

export interface GscPerformanceObservationProps {
	id: GscObservationId;
	gscPropertyId: GscPropertyId;
	projectId: ProjectId;
	observedAt: Date;
	query: string | null;
	page: string | null;
	country: string | null;
	device: string | null;
	metrics: PerformanceMetrics;
	rawPayloadId: string | null;
}

/**
 * One immutable GSC search-analytics row at a given (date, query, page,
 * country, device) granularity. Lives in the time-series store.
 */
export class GscPerformanceObservation extends AggregateRoot {
	private constructor(private readonly props: GscPerformanceObservationProps) {
		super();
	}

	static record(input: {
		id: GscObservationId;
		gscPropertyId: GscPropertyId;
		projectId: ProjectId;
		observedAt: Date;
		query: string | null;
		page: string | null;
		country: string | null;
		device: string | null;
		metrics: PerformanceMetrics;
		rawPayloadId: string | null;
	}): GscPerformanceObservation {
		const observation = new GscPerformanceObservation(input);
		observation.record(
			new GscPerformanceIngested({
				observationId: input.id,
				projectId: input.projectId,
				gscPropertyId: input.gscPropertyId,
				occurredAt: input.observedAt,
				clicks: input.metrics.clicks,
				impressions: input.metrics.impressions,
			}),
		);
		return observation;
	}

	static rehydrate(props: GscPerformanceObservationProps): GscPerformanceObservation {
		return new GscPerformanceObservation(props);
	}

	get id(): GscObservationId {
		return this.props.id;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get gscPropertyId(): GscPropertyId {
		return this.props.gscPropertyId;
	}
	get observedAt(): Date {
		return this.props.observedAt;
	}
	get query(): string | null {
		return this.props.query;
	}
	get page(): string | null {
		return this.props.page;
	}
	get country(): string | null {
		return this.props.country;
	}
	get device(): string | null {
		return this.props.device;
	}
	get metrics(): PerformanceMetrics {
		return this.props.metrics;
	}
	get rawPayloadId(): string | null {
		return this.props.rawPayloadId;
	}
}
