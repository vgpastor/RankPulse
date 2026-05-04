import { ConflictError } from '@rankpulse/shared';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import { MembershipRevoked } from '../events/membership-revoked.js';
import type { MembershipId, OrganizationId, UserId } from '../value-objects/identifiers.js';
import type { Role } from '../value-objects/role.js';

export interface MembershipProps {
	id: MembershipId;
	organizationId: OrganizationId;
	userId: UserId;
	role: Role;
	revokedAt: Date | null;
	createdAt: Date;
}

export class Membership extends AggregateRoot {
	private constructor(private props: MembershipProps) {
		super();
	}

	static grant(input: {
		id: MembershipId;
		organizationId: OrganizationId;
		userId: UserId;
		role: Role;
		now: Date;
	}): Membership {
		return new Membership({
			id: input.id,
			organizationId: input.organizationId,
			userId: input.userId,
			role: input.role,
			revokedAt: null,
			createdAt: input.now,
		});
	}

	static rehydrate(props: MembershipProps): Membership {
		return new Membership(props);
	}

	revoke(now: Date): void {
		if (this.props.revokedAt) {
			throw new ConflictError('Membership is already revoked');
		}
		this.props = { ...this.props, revokedAt: now };
		this.record(
			new MembershipRevoked({
				membershipId: this.props.id,
				organizationId: this.props.organizationId,
				userId: this.props.userId,
				occurredAt: now,
			}),
		);
	}

	isActive(): boolean {
		return this.props.revokedAt === null;
	}

	get id(): MembershipId {
		return this.props.id;
	}
	get organizationId(): OrganizationId {
		return this.props.organizationId;
	}
	get userId(): UserId {
		return this.props.userId;
	}
	get role(): Role {
		return this.props.role;
	}
	get revokedAt(): Date | null {
		return this.props.revokedAt;
	}
	get createdAt(): Date {
		return this.props.createdAt;
	}
}
