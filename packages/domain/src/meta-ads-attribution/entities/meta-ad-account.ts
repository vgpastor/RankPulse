import { ConflictError } from '@rankpulse/shared';
import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import { MetaAdAccountLinked } from '../events/meta-ad-account-linked.js';
import { MetaAdAccountHandle } from '../value-objects/ad-account-handle.js';
import type { MetaAdAccountId } from '../value-objects/identifiers.js';

export interface MetaAdAccountProps {
	id: MetaAdAccountId;
	organizationId: OrganizationId;
	projectId: ProjectId;
	handle: MetaAdAccountHandle;
	credentialId: string | null;
	linkedAt: Date;
	unlinkedAt: Date | null;
}

/**
 * A Meta ad account linked to a RankPulse project. Same shape as MetaPixel
 * (see also Ga4Property): a (project, handle) tuple uniqueness, soft-delete
 * via `unlinked_at` so historic insight rows stay queryable.
 */
export class MetaAdAccount extends AggregateRoot {
	private constructor(private props: MetaAdAccountProps) {
		super();
	}

	static link(input: {
		id: MetaAdAccountId;
		organizationId: OrganizationId;
		projectId: ProjectId;
		adAccountHandle: string;
		credentialId: string | null;
		now: Date;
	}): MetaAdAccount {
		const handle = MetaAdAccountHandle.create(input.adAccountHandle);
		const account = new MetaAdAccount({
			id: input.id,
			organizationId: input.organizationId,
			projectId: input.projectId,
			handle,
			credentialId: input.credentialId,
			linkedAt: input.now,
			unlinkedAt: null,
		});
		account.record(
			new MetaAdAccountLinked({
				metaAdAccountId: input.id,
				projectId: input.projectId,
				organizationId: input.organizationId,
				adAccountHandle: handle.value,
				occurredAt: input.now,
			}),
		);
		return account;
	}

	static rehydrate(props: MetaAdAccountProps): MetaAdAccount {
		return new MetaAdAccount(props);
	}

	unlink(now: Date): void {
		if (this.props.unlinkedAt) {
			throw new ConflictError('MetaAdAccount is already unlinked');
		}
		this.props = { ...this.props, unlinkedAt: now };
	}

	isActive(): boolean {
		return this.props.unlinkedAt === null;
	}

	get id(): MetaAdAccountId {
		return this.props.id;
	}
	get organizationId(): OrganizationId {
		return this.props.organizationId;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get handle(): MetaAdAccountHandle {
		return this.props.handle;
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
