import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import type { Ga4DailyDimensionsMetrics } from '../value-objects/daily-metrics.js';
import type { Ga4DailyMetricId, Ga4PropertyId } from '../value-objects/identifiers.js';

export interface Ga4DailyMetricProps {
	id: Ga4DailyMetricId;
	ga4PropertyId: Ga4PropertyId;
	projectId: ProjectId;
	observedDate: string; // YYYY-MM-DD, the calendar day the row belongs to
	dimensionsHash: string; // SHA-256 over the canonical dimensions JSON, used in the natural PK
	body: Ga4DailyDimensionsMetrics;
	rawPayloadId: string | null;
}

/**
 * One immutable GA4 row at a given (date, dimension-set) granularity.
 * Same shape philosophy as GscPerformanceObservation — value-like factory,
 * no per-row events; the ingest use case publishes one batch summary.
 */
export class Ga4DailyMetric extends AggregateRoot {
	private constructor(private readonly props: Ga4DailyMetricProps) {
		super();
	}

	static record(input: Ga4DailyMetricProps): Ga4DailyMetric {
		return new Ga4DailyMetric(input);
	}

	static rehydrate(props: Ga4DailyMetricProps): Ga4DailyMetric {
		return new Ga4DailyMetric(props);
	}

	get id(): Ga4DailyMetricId {
		return this.props.id;
	}
	get ga4PropertyId(): Ga4PropertyId {
		return this.props.ga4PropertyId;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get observedDate(): string {
		return this.props.observedDate;
	}
	get dimensionsHash(): string {
		return this.props.dimensionsHash;
	}
	get body(): Ga4DailyDimensionsMetrics {
		return this.props.body;
	}
	get rawPayloadId(): string | null {
		return this.props.rawPayloadId;
	}
}
