import { ConflictError } from '@rankpulse/shared';
import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import { ClarityProjectLinked } from '../events/clarity-project-linked.js';
import { ClarityProjectHandle } from '../value-objects/clarity-handle.js';
import type { ClarityProjectId } from '../value-objects/identifiers.js';

export interface ClarityProjectProps {
	id: ClarityProjectId;
	organizationId: OrganizationId;
	projectId: ProjectId;
	clarityHandle: ClarityProjectHandle;
	credentialId: string | null;
	linkedAt: Date;
	unlinkedAt: Date | null;
}

/**
 * A Microsoft Clarity project linked to a RankPulse project. The aggregate
 * is the parent of the experience-metrics time-series; snapshots are
 * value-like rows that don't fan-out events per row.
 */
export class ClarityProject extends AggregateRoot {
	private constructor(private props: ClarityProjectProps) {
		super();
	}

	static link(input: {
		id: ClarityProjectId;
		organizationId: OrganizationId;
		projectId: ProjectId;
		clarityHandle: string;
		credentialId: string | null;
		now: Date;
	}): ClarityProject {
		const handle = ClarityProjectHandle.create(input.clarityHandle);
		const cp = new ClarityProject({
			id: input.id,
			organizationId: input.organizationId,
			projectId: input.projectId,
			clarityHandle: handle,
			credentialId: input.credentialId,
			linkedAt: input.now,
			unlinkedAt: null,
		});
		cp.record(
			new ClarityProjectLinked({
				clarityProjectId: input.id,
				projectId: input.projectId,
				organizationId: input.organizationId,
				clarityHandle: handle.value,
				occurredAt: input.now,
			}),
		);
		return cp;
	}

	static rehydrate(props: ClarityProjectProps): ClarityProject {
		return new ClarityProject(props);
	}

	unlink(now: Date): void {
		if (this.props.unlinkedAt) {
			throw new ConflictError('ClarityProject is already unlinked');
		}
		this.props = { ...this.props, unlinkedAt: now };
	}

	isActive(): boolean {
		return this.props.unlinkedAt === null;
	}

	get id(): ClarityProjectId {
		return this.props.id;
	}
	get organizationId(): OrganizationId {
		return this.props.organizationId;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get clarityHandle(): ClarityProjectHandle {
		return this.props.clarityHandle;
	}
	get credentialId(): string | null {
		return this.props.credentialId;
	}
	get linkedAt(): Date {
		return this.props.linkedAt;
	}
	get unlinkedAt(): Date | null {
		return this.props.unlinkedAt;
	}
}
