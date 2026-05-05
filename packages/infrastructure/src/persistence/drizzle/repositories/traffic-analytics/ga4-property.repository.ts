import { type IdentityAccess, type ProjectManagement, TrafficAnalytics } from '@rankpulse/domain';
import { ConflictError } from '@rankpulse/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { ga4Properties } from '../../schema/index.js';

const UNIQUE_TUPLE_CONSTRAINT = 'ga4_properties_project_handle_unique';

const isUniqueViolation = (err: unknown): boolean => {
	if (!err || typeof err !== 'object') return false;
	const e = err as { code?: string; constraint_name?: string; constraint?: string };
	if (e.code !== '23505') return false;
	const constraint = e.constraint_name ?? e.constraint;
	return constraint === UNIQUE_TUPLE_CONSTRAINT;
};

export class DrizzleGa4PropertyRepository implements TrafficAnalytics.Ga4PropertyRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(property: TrafficAnalytics.Ga4Property): Promise<void> {
		try {
			await this.db
				.insert(ga4Properties)
				.values({
					id: property.id,
					organizationId: property.organizationId,
					projectId: property.projectId,
					propertyHandle: property.propertyHandle.value,
					credentialId: property.credentialId,
					linkedAt: property.linkedAt,
					unlinkedAt: property.unlinkedAt,
				})
				.onConflictDoUpdate({
					target: ga4Properties.id,
					set: {
						propertyHandle: property.propertyHandle.value,
						credentialId: property.credentialId,
						unlinkedAt: property.unlinkedAt,
					},
				});
		} catch (err) {
			if (isUniqueViolation(err)) {
				throw new ConflictError(
					`GA4 property "${property.propertyHandle.value}" is already linked to project ${property.projectId}`,
				);
			}
			throw err;
		}
	}

	async findById(id: TrafficAnalytics.Ga4PropertyId): Promise<TrafficAnalytics.Ga4Property | null> {
		const [row] = await this.db.select().from(ga4Properties).where(eq(ga4Properties.id, id)).limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async findByProjectAndHandle(
		projectId: ProjectManagement.ProjectId,
		propertyHandle: string,
	): Promise<TrafficAnalytics.Ga4Property | null> {
		const handle = TrafficAnalytics.Ga4PropertyHandle.create(propertyHandle);
		const [row] = await this.db
			.select()
			.from(ga4Properties)
			.where(and(eq(ga4Properties.projectId, projectId), eq(ga4Properties.propertyHandle, handle.value)))
			.limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async listForProject(
		projectId: ProjectManagement.ProjectId,
	): Promise<readonly TrafficAnalytics.Ga4Property[]> {
		const rows = await this.db
			.select()
			.from(ga4Properties)
			.where(eq(ga4Properties.projectId, projectId))
			.orderBy(desc(ga4Properties.linkedAt));
		return rows.map((r) => this.toAggregate(r));
	}

	async listForOrganization(
		orgId: IdentityAccess.OrganizationId,
	): Promise<readonly TrafficAnalytics.Ga4Property[]> {
		const rows = await this.db
			.select()
			.from(ga4Properties)
			.where(eq(ga4Properties.organizationId, orgId))
			.orderBy(desc(ga4Properties.linkedAt));
		return rows.map((r) => this.toAggregate(r));
	}

	private toAggregate(row: typeof ga4Properties.$inferSelect): TrafficAnalytics.Ga4Property {
		return TrafficAnalytics.Ga4Property.rehydrate({
			id: row.id as TrafficAnalytics.Ga4PropertyId,
			organizationId: row.organizationId as IdentityAccess.OrganizationId,
			projectId: row.projectId as ProjectManagement.ProjectId,
			propertyHandle: TrafficAnalytics.Ga4PropertyHandle.create(row.propertyHandle),
			credentialId: row.credentialId,
			linkedAt: row.linkedAt,
			unlinkedAt: row.unlinkedAt,
		});
	}
}
