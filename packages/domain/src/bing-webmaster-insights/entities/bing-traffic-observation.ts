import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import type { BingTrafficMetrics } from '../value-objects/bing-traffic-metrics.js';
import type { BingPropertyId } from '../value-objects/identifiers.js';

export interface BingTrafficObservationProps {
	bingPropertyId: BingPropertyId;
	projectId: ProjectId;
	observedDate: string; // YYYY-MM-DD
	metrics: BingTrafficMetrics;
	rawPayloadId: string | null;
}

/**
 * One immutable Bing daily-traffic row at calendar-day granularity.
 * Value-like factory, no per-row events; the ingest use case publishes
 * one batch summary, mirroring the GSC / GA4 patterns.
 *
 * Surrogate id is stamped from the natural key by the repo on read; the
 * domain only knows the natural key (propertyId, observedDate).
 */
export class BingTrafficObservation extends AggregateRoot {
	private constructor(private readonly props: BingTrafficObservationProps) {
		super();
	}

	static record(input: BingTrafficObservationProps): BingTrafficObservation {
		return new BingTrafficObservation(input);
	}

	static rehydrate(props: BingTrafficObservationProps): BingTrafficObservation {
		return new BingTrafficObservation(props);
	}

	get bingPropertyId(): BingPropertyId {
		return this.props.bingPropertyId;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get observedDate(): string {
		return this.props.observedDate;
	}
	get metrics(): BingTrafficMetrics {
		return this.props.metrics;
	}
	get rawPayloadId(): string | null {
		return this.props.rawPayloadId;
	}
}
