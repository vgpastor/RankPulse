import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { MetaAdAccountId } from '../value-objects/identifiers.js';

/**
 * One event per ingest call. Subscribers compute ROAS, alerting and
 * cross-channel attribution downstream from totals; we deliberately
 * include `totalSpend` and `totalConversions` so simple consumers don't
 * have to re-query the read model.
 */
export class MetaAdsInsightsBatchIngested implements DomainEvent {
	readonly type = 'MetaAdsInsightsBatchIngested';
	readonly projectId: ProjectId;
	readonly metaAdAccountId: MetaAdAccountId;
	readonly rowsCount: number;
	readonly totalImpressions: number;
	readonly totalClicks: number;
	readonly totalSpend: number;
	readonly totalConversions: number;
	readonly occurredAt: Date;

	constructor(props: {
		projectId: ProjectId;
		metaAdAccountId: MetaAdAccountId;
		rowsCount: number;
		totalImpressions: number;
		totalClicks: number;
		totalSpend: number;
		totalConversions: number;
		occurredAt: Date;
	}) {
		this.projectId = props.projectId;
		this.metaAdAccountId = props.metaAdAccountId;
		this.rowsCount = props.rowsCount;
		this.totalImpressions = props.totalImpressions;
		this.totalClicks = props.totalClicks;
		this.totalSpend = props.totalSpend;
		this.totalConversions = props.totalConversions;
		this.occurredAt = props.occurredAt;
	}
}
