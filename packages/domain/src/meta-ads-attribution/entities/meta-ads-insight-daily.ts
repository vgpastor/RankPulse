import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import type { MetaAdsInsightMetrics } from '../value-objects/ads-insight-metrics.js';
import type { MetaAdAccountId } from '../value-objects/identifiers.js';

export interface MetaAdsInsightDailyProps {
	metaAdAccountId: MetaAdAccountId;
	projectId: ProjectId;
	observedDate: string; // YYYY-MM-DD
	metrics: MetaAdsInsightMetrics;
	rawPayloadId: string | null;
}

/**
 * One immutable daily aggregate at (ad_account, day, level, entity_id)
 * granularity. The level + entity_id composite lives inside
 * `MetaAdsInsightMetrics` so the natural key is straightforward to project
 * out at the repo boundary.
 */
export class MetaAdsInsightDaily extends AggregateRoot {
	private constructor(private readonly props: MetaAdsInsightDailyProps) {
		super();
	}

	static record(input: MetaAdsInsightDailyProps): MetaAdsInsightDaily {
		return new MetaAdsInsightDaily(input);
	}

	static rehydrate(props: MetaAdsInsightDailyProps): MetaAdsInsightDaily {
		return new MetaAdsInsightDaily(props);
	}

	get metaAdAccountId(): MetaAdAccountId {
		return this.props.metaAdAccountId;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get observedDate(): string {
		return this.props.observedDate;
	}
	get metrics(): MetaAdsInsightMetrics {
		return this.props.metrics;
	}
	get rawPayloadId(): string | null {
		return this.props.rawPayloadId;
	}
}
