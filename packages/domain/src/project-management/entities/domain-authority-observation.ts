import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import type { DomainAuthorityObservationId, ProjectId } from '../value-objects/identifiers.js';
import type { BacklinksProfileMetrics } from './competitor-activity-observation.js';

export interface DomainAuthorityObservationProps {
	id: DomainAuthorityObservationId;
	projectId: ProjectId;
	domain: string;
	observedAt: Date;
	metrics: BacklinksProfileMetrics;
	rawPayloadId: string | null;
}

/**
 * One snapshot of a project's own link authority: what the web says about
 * the domain we are trying to rank, not about a competitor.
 *
 * Kept apart from `CompetitorActivityObservation` on purpose. That aggregate
 * is keyed by competitor and answers "is this rival moving"; this one is
 * keyed by project and answers "does Google have a reason to trust us". The
 * question came up when nine satellite domains turned out to have no
 * referring domains at all while their sitemaps were being read and ignored
 * — a fact nothing in the system was measuring.
 *
 * `observedAt` is truncated to the start of the UTC day so one fetch per day
 * per project is the natural idempotency key, as with the competitor rows.
 */
export class DomainAuthorityObservation extends AggregateRoot {
	private constructor(private readonly props: DomainAuthorityObservationProps) {
		super();
	}

	static record(input: {
		id: DomainAuthorityObservationId;
		projectId: ProjectId;
		domain: string;
		metrics: BacklinksProfileMetrics;
		rawPayloadId: string | null;
		now: Date;
	}): DomainAuthorityObservation {
		const day = new Date(input.now);
		day.setUTCHours(0, 0, 0, 0);
		return new DomainAuthorityObservation({
			id: input.id,
			projectId: input.projectId,
			domain: input.domain,
			observedAt: day,
			metrics: input.metrics,
			rawPayloadId: input.rawPayloadId,
		});
	}

	static rehydrate(props: DomainAuthorityObservationProps): DomainAuthorityObservation {
		return new DomainAuthorityObservation(props);
	}

	get id(): DomainAuthorityObservationId {
		return this.props.id;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get domain(): string {
		return this.props.domain;
	}
	get observedAt(): Date {
		return this.props.observedAt;
	}
	get metrics(): BacklinksProfileMetrics {
		return this.props.metrics;
	}
	get rawPayloadId(): string | null {
		return this.props.rawPayloadId;
	}
}
