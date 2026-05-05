import { ConflictError } from '@rankpulse/shared';
import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import { Ga4PropertyLinked } from '../events/ga4-property-linked.js';
import type { Ga4PropertyId } from '../value-objects/identifiers.js';
import { Ga4PropertyHandle } from '../value-objects/property-handle.js';

export interface Ga4PropertyProps {
	id: Ga4PropertyId;
	organizationId: OrganizationId;
	projectId: ProjectId;
	propertyHandle: Ga4PropertyHandle;
	credentialId: string | null;
	linkedAt: Date;
	unlinkedAt: Date | null;
}

/**
 * A GA4 property linked to a RankPulse project. Owns the credential pin
 * (same pattern as GscProperty) so a re-fetch always uses the SA the user
 * authorised at link time, not whatever the cascade picks today.
 */
export class Ga4Property extends AggregateRoot {
	private constructor(private props: Ga4PropertyProps) {
		super();
	}

	static link(input: {
		id: Ga4PropertyId;
		organizationId: OrganizationId;
		projectId: ProjectId;
		propertyHandle: string;
		credentialId: string | null;
		now: Date;
	}): Ga4Property {
		const handle = Ga4PropertyHandle.create(input.propertyHandle);
		const property = new Ga4Property({
			id: input.id,
			organizationId: input.organizationId,
			projectId: input.projectId,
			propertyHandle: handle,
			credentialId: input.credentialId,
			linkedAt: input.now,
			unlinkedAt: null,
		});
		property.record(
			new Ga4PropertyLinked({
				ga4PropertyId: input.id,
				projectId: input.projectId,
				organizationId: input.organizationId,
				propertyHandle: handle.value,
				occurredAt: input.now,
			}),
		);
		return property;
	}

	static rehydrate(props: Ga4PropertyProps): Ga4Property {
		return new Ga4Property(props);
	}

	unlink(now: Date): void {
		if (this.props.unlinkedAt) {
			throw new ConflictError('Ga4Property is already unlinked');
		}
		this.props = { ...this.props, unlinkedAt: now };
	}

	isActive(): boolean {
		return this.props.unlinkedAt === null;
	}

	get id(): Ga4PropertyId {
		return this.props.id;
	}
	get organizationId(): OrganizationId {
		return this.props.organizationId;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get propertyHandle(): Ga4PropertyHandle {
		return this.props.propertyHandle;
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
