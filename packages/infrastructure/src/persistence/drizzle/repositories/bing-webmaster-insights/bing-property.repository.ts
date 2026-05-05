import { BingWebmasterInsights, type IdentityAccess, type ProjectManagement } from '@rankpulse/domain';
import { ConflictError } from '@rankpulse/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { bingProperties } from '../../schema/index.js';

const UNIQUE_TUPLE_CONSTRAINT = 'bing_properties_project_site_unique';

const isUniqueViolation = (err: unknown): boolean => {
	if (!err || typeof err !== 'object') return false;
	const e = err as { code?: string; constraint_name?: string; constraint?: string };
	if (e.code !== '23505') return false;
	const constraint = e.constraint_name ?? e.constraint;
	return constraint === UNIQUE_TUPLE_CONSTRAINT;
};

export class DrizzleBingPropertyRepository implements BingWebmasterInsights.BingPropertyRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(property: BingWebmasterInsights.BingProperty): Promise<void> {
		try {
			await this.db
				.insert(bingProperties)
				.values({
					id: property.id,
					organizationId: property.organizationId,
					projectId: property.projectId,
					siteUrl: property.siteUrl,
					credentialId: property.credentialId,
					linkedAt: property.linkedAt,
					unlinkedAt: property.unlinkedAt,
				})
				.onConflictDoUpdate({
					target: bingProperties.id,
					set: {
						siteUrl: property.siteUrl,
						credentialId: property.credentialId,
						unlinkedAt: property.unlinkedAt,
					},
				});
		} catch (err) {
			if (isUniqueViolation(err)) {
				throw new ConflictError(
					`Bing property "${property.siteUrl}" is already linked to project ${property.projectId}`,
				);
			}
			throw err;
		}
	}

	async findById(
		id: BingWebmasterInsights.BingPropertyId,
	): Promise<BingWebmasterInsights.BingProperty | null> {
		const [row] = await this.db.select().from(bingProperties).where(eq(bingProperties.id, id)).limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async findByProjectAndSite(
		projectId: ProjectManagement.ProjectId,
		siteUrl: string,
	): Promise<BingWebmasterInsights.BingProperty | null> {
		const [row] = await this.db
			.select()
			.from(bingProperties)
			.where(and(eq(bingProperties.projectId, projectId), eq(bingProperties.siteUrl, siteUrl)))
			.limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async listForProject(
		projectId: ProjectManagement.ProjectId,
	): Promise<readonly BingWebmasterInsights.BingProperty[]> {
		const rows = await this.db
			.select()
			.from(bingProperties)
			.where(eq(bingProperties.projectId, projectId))
			.orderBy(desc(bingProperties.linkedAt));
		return rows.map((r) => this.toAggregate(r));
	}

	async listForOrganization(
		orgId: IdentityAccess.OrganizationId,
	): Promise<readonly BingWebmasterInsights.BingProperty[]> {
		const rows = await this.db
			.select()
			.from(bingProperties)
			.where(eq(bingProperties.organizationId, orgId))
			.orderBy(desc(bingProperties.linkedAt));
		return rows.map((r) => this.toAggregate(r));
	}

	private toAggregate(row: typeof bingProperties.$inferSelect): BingWebmasterInsights.BingProperty {
		return BingWebmasterInsights.BingProperty.rehydrate({
			id: row.id as BingWebmasterInsights.BingPropertyId,
			organizationId: row.organizationId as IdentityAccess.OrganizationId,
			projectId: row.projectId as ProjectManagement.ProjectId,
			siteUrl: row.siteUrl,
			credentialId: row.credentialId,
			linkedAt: row.linkedAt,
			unlinkedAt: row.unlinkedAt,
		});
	}
}
