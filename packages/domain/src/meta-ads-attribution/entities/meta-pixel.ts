import { ConflictError } from '@rankpulse/shared';
import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import { MetaPixelLinked } from '../events/meta-pixel-linked.js';
import type { MetaPixelId } from '../value-objects/identifiers.js';
import { MetaPixelHandle } from '../value-objects/pixel-handle.js';

export interface MetaPixelProps {
	id: MetaPixelId;
	organizationId: OrganizationId;
	projectId: ProjectId;
	handle: MetaPixelHandle;
	credentialId: string | null;
	linkedAt: Date;
	unlinkedAt: Date | null;
}

/**
 * A Meta Pixel linked to a RankPulse project. Owns the credential pin
 * (same pattern as Ga4Property) so a re-fetch always uses the access token
 * the user authorised at link time, not whatever the cascade picks today.
 */
export class MetaPixel extends AggregateRoot {
	private constructor(private props: MetaPixelProps) {
		super();
	}

	static link(input: {
		id: MetaPixelId;
		organizationId: OrganizationId;
		projectId: ProjectId;
		pixelHandle: string;
		credentialId: string | null;
		now: Date;
	}): MetaPixel {
		const handle = MetaPixelHandle.create(input.pixelHandle);
		const pixel = new MetaPixel({
			id: input.id,
			organizationId: input.organizationId,
			projectId: input.projectId,
			handle,
			credentialId: input.credentialId,
			linkedAt: input.now,
			unlinkedAt: null,
		});
		pixel.record(
			new MetaPixelLinked({
				metaPixelId: input.id,
				projectId: input.projectId,
				organizationId: input.organizationId,
				pixelHandle: handle.value,
				occurredAt: input.now,
			}),
		);
		return pixel;
	}

	static rehydrate(props: MetaPixelProps): MetaPixel {
		return new MetaPixel(props);
	}

	unlink(now: Date): void {
		if (this.props.unlinkedAt) {
			throw new ConflictError('MetaPixel is already unlinked');
		}
		this.props = { ...this.props, unlinkedAt: now };
	}

	isActive(): boolean {
		return this.props.unlinkedAt === null;
	}

	get id(): MetaPixelId {
		return this.props.id;
	}
	get organizationId(): OrganizationId {
		return this.props.organizationId;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get handle(): MetaPixelHandle {
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
