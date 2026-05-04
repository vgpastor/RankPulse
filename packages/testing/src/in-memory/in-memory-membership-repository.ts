import type { IdentityAccess } from '@rankpulse/domain';

export class InMemoryMembershipRepository implements IdentityAccess.MembershipRepository {
	private byId = new Map<string, IdentityAccess.Membership>();

	async save(m: IdentityAccess.Membership): Promise<void> {
		this.byId.set(m.id, m);
	}

	async findById(id: IdentityAccess.MembershipId): Promise<IdentityAccess.Membership | null> {
		return this.byId.get(id) ?? null;
	}

	async findActiveFor(
		orgId: IdentityAccess.OrganizationId,
		userId: IdentityAccess.UserId,
	): Promise<IdentityAccess.Membership | null> {
		for (const m of this.byId.values()) {
			if (m.organizationId === orgId && m.userId === userId && m.isActive()) {
				return m;
			}
		}
		return null;
	}

	async listForOrganization(
		orgId: IdentityAccess.OrganizationId,
	): Promise<readonly IdentityAccess.Membership[]> {
		return [...this.byId.values()].filter((m) => m.organizationId === orgId);
	}

	async listForUser(userId: IdentityAccess.UserId): Promise<readonly IdentityAccess.Membership[]> {
		return [...this.byId.values()].filter((m) => m.userId === userId);
	}

	size(): number {
		return this.byId.size;
	}
}
