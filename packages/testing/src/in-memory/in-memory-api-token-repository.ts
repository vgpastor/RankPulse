import type { IdentityAccess } from '@rankpulse/domain';

export class InMemoryApiTokenRepository implements IdentityAccess.ApiTokenRepository {
	private byId = new Map<string, IdentityAccess.ApiToken>();
	private byHash = new Map<string, string>();

	async save(token: IdentityAccess.ApiToken): Promise<void> {
		this.byId.set(token.id, token);
		this.byHash.set(token.hashedToken, token.id);
	}

	async findById(id: IdentityAccess.ApiTokenId): Promise<IdentityAccess.ApiToken | null> {
		return this.byId.get(id) ?? null;
	}

	async findByHashedToken(hashed: string): Promise<IdentityAccess.ApiToken | null> {
		const id = this.byHash.get(hashed);
		return id ? (this.byId.get(id) ?? null) : null;
	}

	async listForOrganization(
		orgId: IdentityAccess.OrganizationId,
	): Promise<readonly IdentityAccess.ApiToken[]> {
		return [...this.byId.values()].filter((t) => t.organizationId === orgId);
	}

	size(): number {
		return this.byId.size;
	}
}
