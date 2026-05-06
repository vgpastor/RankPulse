import { type IdentityAccess, MetaAdsAttribution, type ProjectManagement } from '@rankpulse/domain';
import { ConflictError } from '@rankpulse/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { metaPixels } from '../../schema/index.js';

const UNIQUE_TUPLE_CONSTRAINT = 'meta_pixels_project_handle_unique';

const isUniqueViolation = (err: unknown): boolean => {
	if (!err || typeof err !== 'object') return false;
	const e = err as { code?: string; constraint_name?: string; constraint?: string };
	if (e.code !== '23505') return false;
	const constraint = e.constraint_name ?? e.constraint;
	return constraint === UNIQUE_TUPLE_CONSTRAINT;
};

export class DrizzleMetaPixelRepository implements MetaAdsAttribution.MetaPixelRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(pixel: MetaAdsAttribution.MetaPixel): Promise<void> {
		try {
			await this.db
				.insert(metaPixels)
				.values({
					id: pixel.id,
					organizationId: pixel.organizationId,
					projectId: pixel.projectId,
					pixelHandle: pixel.handle.value,
					credentialId: pixel.credentialId,
					linkedAt: pixel.linkedAt,
					unlinkedAt: pixel.unlinkedAt,
				})
				.onConflictDoUpdate({
					target: metaPixels.id,
					set: {
						pixelHandle: pixel.handle.value,
						credentialId: pixel.credentialId,
						unlinkedAt: pixel.unlinkedAt,
					},
				});
		} catch (err) {
			if (isUniqueViolation(err)) {
				throw new ConflictError(
					`Meta pixel "${pixel.handle.value}" is already linked to project ${pixel.projectId}`,
				);
			}
			throw err;
		}
	}

	async findById(id: MetaAdsAttribution.MetaPixelId): Promise<MetaAdsAttribution.MetaPixel | null> {
		const [row] = await this.db.select().from(metaPixels).where(eq(metaPixels.id, id)).limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async findByProjectAndHandle(
		projectId: ProjectManagement.ProjectId,
		pixelHandle: string,
	): Promise<MetaAdsAttribution.MetaPixel | null> {
		const handle = MetaAdsAttribution.MetaPixelHandle.create(pixelHandle);
		const [row] = await this.db
			.select()
			.from(metaPixels)
			.where(and(eq(metaPixels.projectId, projectId), eq(metaPixels.pixelHandle, handle.value)))
			.limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async listForProject(
		projectId: ProjectManagement.ProjectId,
	): Promise<readonly MetaAdsAttribution.MetaPixel[]> {
		const rows = await this.db
			.select()
			.from(metaPixels)
			.where(eq(metaPixels.projectId, projectId))
			.orderBy(desc(metaPixels.linkedAt));
		return rows.map((r) => this.toAggregate(r));
	}

	async listForOrganization(
		orgId: IdentityAccess.OrganizationId,
	): Promise<readonly MetaAdsAttribution.MetaPixel[]> {
		const rows = await this.db
			.select()
			.from(metaPixels)
			.where(eq(metaPixels.organizationId, orgId))
			.orderBy(desc(metaPixels.linkedAt));
		return rows.map((r) => this.toAggregate(r));
	}

	private toAggregate(row: typeof metaPixels.$inferSelect): MetaAdsAttribution.MetaPixel {
		return MetaAdsAttribution.MetaPixel.rehydrate({
			id: row.id as MetaAdsAttribution.MetaPixelId,
			organizationId: row.organizationId as IdentityAccess.OrganizationId,
			projectId: row.projectId as ProjectManagement.ProjectId,
			handle: MetaAdsAttribution.MetaPixelHandle.create(row.pixelHandle),
			credentialId: row.credentialId,
			linkedAt: row.linkedAt,
			unlinkedAt: row.unlinkedAt,
		});
	}
}
