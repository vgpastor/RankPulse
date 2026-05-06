import { ConflictError } from '@rankpulse/shared';
import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import { MonitoredDomainAdded } from '../events/monitored-domain-added.js';
import { DomainName } from '../value-objects/domain-name.js';
import type { MonitoredDomainId } from '../value-objects/identifiers.js';

export interface MonitoredDomainProps {
	id: MonitoredDomainId;
	organizationId: OrganizationId;
	projectId: ProjectId;
	domain: DomainName;
	credentialId: string | null;
	addedAt: Date;
	removedAt: Date | null;
}

/**
 * A bare domain whose macro-context (Cloudflare Radar rank, in v1) is
 * snapshotted monthly. The aggregate is the parent of the snapshot
 * time-series, but snapshots themselves are value-like rows that don't
 * fan-out events per-row (mirrors GSC / GA4 / Bing aggregations).
 */
export class MonitoredDomain extends AggregateRoot {
	private constructor(private props: MonitoredDomainProps) {
		super();
	}

	static add(input: {
		id: MonitoredDomainId;
		organizationId: OrganizationId;
		projectId: ProjectId;
		domain: string;
		credentialId: string | null;
		now: Date;
	}): MonitoredDomain {
		const domain = DomainName.create(input.domain);
		const md = new MonitoredDomain({
			id: input.id,
			organizationId: input.organizationId,
			projectId: input.projectId,
			domain,
			credentialId: input.credentialId,
			addedAt: input.now,
			removedAt: null,
		});
		md.record(
			new MonitoredDomainAdded({
				monitoredDomainId: input.id,
				projectId: input.projectId,
				organizationId: input.organizationId,
				domain: domain.value,
				occurredAt: input.now,
			}),
		);
		return md;
	}

	static rehydrate(props: MonitoredDomainProps): MonitoredDomain {
		return new MonitoredDomain(props);
	}

	remove(now: Date): void {
		if (this.props.removedAt) {
			throw new ConflictError('MonitoredDomain is already removed');
		}
		this.props = { ...this.props, removedAt: now };
	}

	isActive(): boolean {
		return this.props.removedAt === null;
	}

	get id(): MonitoredDomainId {
		return this.props.id;
	}
	get organizationId(): OrganizationId {
		return this.props.organizationId;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get domain(): DomainName {
		return this.props.domain;
	}
	get credentialId(): string | null {
		return this.props.credentialId;
	}
	get addedAt(): Date {
		return this.props.addedAt;
	}
	get removedAt(): Date | null {
		return this.props.removedAt;
	}
}
