import { IdentityAccess } from '@rankpulse/domain';
import { eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { organizations } from '../../schema/index.js';

export class DrizzleOrganizationRepository implements IdentityAccess.OrganizationRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(org: IdentityAccess.Organization): Promise<void> {
		await this.db
			.insert(organizations)
			.values({
				id: org.id,
				name: org.name,
				slug: org.slug,
				createdAt: org.createdAt,
			})
			.onConflictDoUpdate({
				target: organizations.id,
				set: { name: org.name, slug: org.slug },
			});
	}

	async findById(id: IdentityAccess.OrganizationId): Promise<IdentityAccess.Organization | null> {
		const [row] = await this.db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async findBySlug(slug: string): Promise<IdentityAccess.Organization | null> {
		const [row] = await this.db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
		return row ? this.toAggregate(row) : null;
	}

	private toAggregate(row: typeof organizations.$inferSelect): IdentityAccess.Organization {
		return IdentityAccess.Organization.rehydrate({
			id: row.id as IdentityAccess.OrganizationId,
			name: row.name,
			slug: row.slug,
			createdAt: row.createdAt,
		});
	}
}
