import { type IdentityAccess, type ProjectManagement, SearchConsoleInsights } from '@rankpulse/domain';
import { InvalidInputError } from '@rankpulse/shared';
import { and, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { gscProperties } from '../../schema/index.js';

export class DrizzleGscPropertyRepository implements SearchConsoleInsights.GscPropertyRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(p: SearchConsoleInsights.GscProperty): Promise<void> {
		await this.db
			.insert(gscProperties)
			.values({
				id: p.id,
				organizationId: p.organizationId,
				projectId: p.projectId,
				siteUrl: p.siteUrl,
				propertyType: p.propertyType,
				credentialId: p.credentialId,
				linkedAt: p.linkedAt,
				unlinkedAt: p.unlinkedAt,
			})
			.onConflictDoUpdate({
				target: gscProperties.id,
				set: {
					credentialId: p.credentialId,
					unlinkedAt: p.unlinkedAt,
				},
			});
	}

	async findById(id: SearchConsoleInsights.GscPropertyId): Promise<SearchConsoleInsights.GscProperty | null> {
		const [row] = await this.db.select().from(gscProperties).where(eq(gscProperties.id, id)).limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async findByProjectAndSite(
		projectId: ProjectManagement.ProjectId,
		siteUrl: string,
	): Promise<SearchConsoleInsights.GscProperty | null> {
		const [row] = await this.db
			.select()
			.from(gscProperties)
			.where(and(eq(gscProperties.projectId, projectId), eq(gscProperties.siteUrl, siteUrl)))
			.limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async listForProject(
		projectId: ProjectManagement.ProjectId,
	): Promise<readonly SearchConsoleInsights.GscProperty[]> {
		const rows = await this.db.select().from(gscProperties).where(eq(gscProperties.projectId, projectId));
		return rows.map((r) => this.toAggregate(r));
	}

	async listForOrganization(
		orgId: IdentityAccess.OrganizationId,
	): Promise<readonly SearchConsoleInsights.GscProperty[]> {
		const rows = await this.db.select().from(gscProperties).where(eq(gscProperties.organizationId, orgId));
		return rows.map((r) => this.toAggregate(r));
	}

	private toAggregate(row: typeof gscProperties.$inferSelect): SearchConsoleInsights.GscProperty {
		if (!SearchConsoleInsights.isGscPropertyType(row.propertyType)) {
			throw new InvalidInputError(`Stored GSC property has invalid propertyType "${row.propertyType}"`);
		}
		return SearchConsoleInsights.GscProperty.rehydrate({
			id: row.id as SearchConsoleInsights.GscPropertyId,
			organizationId: row.organizationId as IdentityAccess.OrganizationId,
			projectId: row.projectId as ProjectManagement.ProjectId,
			siteUrl: row.siteUrl,
			propertyType: row.propertyType,
			credentialId: row.credentialId,
			linkedAt: row.linkedAt,
			unlinkedAt: row.unlinkedAt,
		});
	}
}
