import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import type { MetaPixelId } from '../value-objects/identifiers.js';
import type { MetaPixelEventStats } from '../value-objects/pixel-event-stats.js';

export interface MetaPixelEventDailyProps {
	metaPixelId: MetaPixelId;
	projectId: ProjectId;
	observedDate: string; // YYYY-MM-DD
	eventName: string;
	stats: MetaPixelEventStats;
	rawPayloadId: string | null;
}

/**
 * One immutable daily aggregate at the (pixel, day, event_name) granularity.
 * Same shape philosophy as Ga4DailyMetric and BingTrafficObservation —
 * value-like factory, no per-row events; the ingest use case publishes one
 * batch summary.
 */
export class MetaPixelEventDaily extends AggregateRoot {
	private constructor(private readonly props: MetaPixelEventDailyProps) {
		super();
	}

	static record(input: MetaPixelEventDailyProps): MetaPixelEventDaily {
		return new MetaPixelEventDaily(input);
	}

	static rehydrate(props: MetaPixelEventDailyProps): MetaPixelEventDaily {
		return new MetaPixelEventDaily(props);
	}

	get metaPixelId(): MetaPixelId {
		return this.props.metaPixelId;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get observedDate(): string {
		return this.props.observedDate;
	}
	get eventName(): string {
		return this.props.eventName;
	}
	get stats(): MetaPixelEventStats {
		return this.props.stats;
	}
	get rawPayloadId(): string | null {
		return this.props.rawPayloadId;
	}
}
