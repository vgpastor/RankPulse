import { IdentityAccess } from '@rankpulse/domain';
import { InvalidInputError } from '@rankpulse/shared';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { memberships } from '../../schema/index.js';

export class DrizzleMembershipRepository implements IdentityAccess.MembershipRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(membership: IdentityAccess.Membership): Promise<void> {
		await this.db
			.insert(memberships)
			.values({
				id: membership.id,
				organizationId: membership.organizationId,
				userId: membership.userId,
				role: membership.role,
				revokedAt: membership.revokedAt,
				createdAt: membership.createdAt,
			})
			.onConflictDoUpdate({
				target: memberships.id,
				set: {
					role: membership.role,
					revokedAt: membership.revokedAt,
				},
			});
	}

	async findById(id: IdentityAccess.MembershipId): Promise<IdentityAccess.Membership | null> {
		const [row] = await this.db.select().from(memberships).where(eq(memberships.id, id)).limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async findActiveFor(
		orgId: IdentityAccess.OrganizationId,
		userId: IdentityAccess.UserId,
	): Promise<IdentityAccess.Membership | null> {
		const [row] = await this.db
			.select()
			.from(memberships)
			.where(
				and(
					eq(memberships.organizationId, orgId),
					eq(memberships.userId, userId),
					isNull(memberships.revokedAt),
				),
			)
			.limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async listForOrganization(
		orgId: IdentityAccess.OrganizationId,
	): Promise<readonly IdentityAccess.Membership[]> {
		const rows = await this.db
			.select()
			.from(memberships)
			.where(eq(memberships.organizationId, orgId))
			.orderBy(desc(memberships.createdAt));
		return rows.map((r) => this.toAggregate(r));
	}

	async listForUser(userId: IdentityAccess.UserId): Promise<readonly IdentityAccess.Membership[]> {
		const rows = await this.db
			.select()
			.from(memberships)
			.where(eq(memberships.userId, userId))
			.orderBy(desc(memberships.createdAt));
		return rows.map((r) => this.toAggregate(r));
	}

	private toAggregate(row: typeof memberships.$inferSelect): IdentityAccess.Membership {
		if (!IdentityAccess.isRole(row.role)) {
			throw new InvalidInputError(`Stored membership has invalid role "${row.role}"`);
		}
		return IdentityAccess.Membership.rehydrate({
			id: row.id as IdentityAccess.MembershipId,
			organizationId: row.organizationId as IdentityAccess.OrganizationId,
			userId: row.userId as IdentityAccess.UserId,
			role: row.role,
			revokedAt: row.revokedAt,
			createdAt: row.createdAt,
		});
	}
}
