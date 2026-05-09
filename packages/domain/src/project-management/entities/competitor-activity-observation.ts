import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import type {
	CompetitorActivityObservationId,
	CompetitorId,
	ProjectId,
} from '../value-objects/identifiers.js';

export type CompetitorActivitySource = 'wayback-cdx' | 'dataforseo-backlinks';

export interface WaybackSnapshotMetrics {
	readonly snapshotCount: number;
	readonly latestSnapshotAt: Date | null;
	readonly earliestSnapshotAt: Date | null;
}

export interface BacklinksProfileMetrics {
	readonly totalBacklinks: number;
	readonly referringDomains: number;
	readonly referringMainDomains: number;
	readonly referringPages: number;
	readonly brokenBacklinks: number;
	readonly spamScore: number | null;
	readonly rank: number | null;
}

export interface CompetitorActivityObservationProps {
	id: CompetitorActivityObservationId;
	projectId: ProjectId;
	competitorId: CompetitorId;
	source: CompetitorActivitySource;
	observedAt: Date;
	wayback: WaybackSnapshotMetrics | null;
	backlinks: BacklinksProfileMetrics | null;
	rawPayloadId: string | null;
}

/**
 * One immutable snapshot of a competitor's activity (Wayback snapshots
 * and/or DataForSEO backlinks profile) at a given moment. Source-tagged
 * because the two ingest paths populate different metric subsets — the
 * read model joins them per `(competitorId, observed_at::date)`.
 *
 * `observedAt` is normalised to start-of-day-UTC so re-runs on the same
 * day idempotently overwrite rather than producing duplicates.
 */
export class CompetitorActivityObservation extends AggregateRoot {
	private constructor(private readonly props: CompetitorActivityObservationProps) {
		super();
	}

	static recordWaybackSnapshot(input: {
		id: CompetitorActivityObservationId;
		projectId: ProjectId;
		competitorId: CompetitorId;
		metrics: WaybackSnapshotMetrics;
		rawPayloadId: string | null;
		now: Date;
	}): CompetitorActivityObservation {
		return new CompetitorActivityObservation({
			id: input.id,
			projectId: input.projectId,
			competitorId: input.competitorId,
			source: 'wayback-cdx',
			observedAt: CompetitorActivityObservation.startOfDayUtc(input.now),
			wayback: input.metrics,
			backlinks: null,
			rawPayloadId: input.rawPayloadId,
		});
	}

	static recordBacklinksProfile(input: {
		id: CompetitorActivityObservationId;
		projectId: ProjectId;
		competitorId: CompetitorId;
		metrics: BacklinksProfileMetrics;
		rawPayloadId: string | null;
		now: Date;
	}): CompetitorActivityObservation {
		return new CompetitorActivityObservation({
			id: input.id,
			projectId: input.projectId,
			competitorId: input.competitorId,
			source: 'dataforseo-backlinks',
			observedAt: CompetitorActivityObservation.startOfDayUtc(input.now),
			wayback: null,
			backlinks: input.metrics,
			rawPayloadId: input.rawPayloadId,
		});
	}

	static rehydrate(props: CompetitorActivityObservationProps): CompetitorActivityObservation {
		return new CompetitorActivityObservation(props);
	}

	private static startOfDayUtc(d: Date): Date {
		return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
	}

	get id(): CompetitorActivityObservationId {
		return this.props.id;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get competitorId(): CompetitorId {
		return this.props.competitorId;
	}
	get source(): CompetitorActivitySource {
		return this.props.source;
	}
	get observedAt(): Date {
		return this.props.observedAt;
	}
	get wayback(): WaybackSnapshotMetrics | null {
		return this.props.wayback;
	}
	get backlinks(): BacklinksProfileMetrics | null {
		return this.props.backlinks;
	}
	get rawPayloadId(): string | null {
		return this.props.rawPayloadId;
	}
}
