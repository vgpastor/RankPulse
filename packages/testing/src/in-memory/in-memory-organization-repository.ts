import type { IdentityAccess } from '@rankpulse/domain';

export class InMemoryOrganizationRepository implements IdentityAccess.OrganizationRepository {
	private byId = new Map<string, IdentityAccess.Organization>();
	private bySlug = new Map<string, string>();

	async save(org: IdentityAccess.Organization): Promise<void> {
		this.byId.set(org.id, org);
		this.bySlug.set(org.slug, org.id);
	}

	async findById(id: IdentityAccess.OrganizationId): Promise<IdentityAccess.Organization | null> {
		return this.byId.get(id) ?? null;
	}

	async findBySlug(slug: string): Promise<IdentityAccess.Organization | null> {
		const id = this.bySlug.get(slug);
		return id ? (this.byId.get(id) ?? null) : null;
	}

	size(): number {
		return this.byId.size;
	}
}
