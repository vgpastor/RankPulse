import { type IdentityAccess, MetaAdsAttribution, type ProjectManagement } from '@rankpulse/domain';
import { ConflictError } from '@rankpulse/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { metaAdAccounts } from '../../schema/index.js';

const UNIQUE_TUPLE_CONSTRAINT = 'meta_ad_accounts_project_handle_unique';

const isUniqueViolation = (err: unknown): boolean => {
	if (!err || typeof err !== 'object') return false;
	const e = err as { code?: string; constraint_name?: string; constraint?: string };
	if (e.code !== '23505') return false;
	const constraint = e.constraint_name ?? e.constraint;
	return constraint === UNIQUE_TUPLE_CONSTRAINT;
};

export class DrizzleMetaAdAccountRepository implements MetaAdsAttribution.MetaAdAccountRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(account: MetaAdsAttribution.MetaAdAccount): Promise<void> {
		try {
			await this.db
				.insert(metaAdAccounts)
				.values({
					id: account.id,
					organizationId: account.organizationId,
					projectId: account.projectId,
					adAccountHandle: account.handle.value,
					credentialId: account.credentialId,
					linkedAt: account.linkedAt,
					unlinkedAt: account.unlinkedAt,
				})
				.onConflictDoUpdate({
					target: metaAdAccounts.id,
					set: {
						adAccountHandle: account.handle.value,
						credentialId: account.credentialId,
						unlinkedAt: account.unlinkedAt,
					},
				});
		} catch (err) {
			if (isUniqueViolation(err)) {
				throw new ConflictError(
					`Meta ad account "${account.handle.value}" is already linked to project ${account.projectId}`,
				);
			}
			throw err;
		}
	}

	async findById(id: MetaAdsAttribution.MetaAdAccountId): Promise<MetaAdsAttribution.MetaAdAccount | null> {
		const [row] = await this.db.select().from(metaAdAccounts).where(eq(metaAdAccounts.id, id)).limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async findByProjectAndHandle(
		projectId: ProjectManagement.ProjectId,
		adAccountHandle: string,
	): Promise<MetaAdsAttribution.MetaAdAccount | null> {
		const handle = MetaAdsAttribution.MetaAdAccountHandle.create(adAccountHandle);
		const [row] = await this.db
			.select()
			.from(metaAdAccounts)
			.where(and(eq(metaAdAccounts.projectId, projectId), eq(metaAdAccounts.adAccountHandle, handle.value)))
			.limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async listForProject(
		projectId: ProjectManagement.ProjectId,
	): Promise<readonly MetaAdsAttribution.MetaAdAccount[]> {
		const rows = await this.db
			.select()
			.from(metaAdAccounts)
			.where(eq(metaAdAccounts.projectId, projectId))
			.orderBy(desc(metaAdAccounts.linkedAt));
		return rows.map((r) => this.toAggregate(r));
	}

	async listForOrganization(
		orgId: IdentityAccess.OrganizationId,
	): Promise<readonly MetaAdsAttribution.MetaAdAccount[]> {
		const rows = await this.db
			.select()
			.from(metaAdAccounts)
			.where(eq(metaAdAccounts.organizationId, orgId))
			.orderBy(desc(metaAdAccounts.linkedAt));
		return rows.map((r) => this.toAggregate(r));
	}

	private toAggregate(row: typeof metaAdAccounts.$inferSelect): MetaAdsAttribution.MetaAdAccount {
		return MetaAdsAttribution.MetaAdAccount.rehydrate({
			id: row.id as MetaAdsAttribution.MetaAdAccountId,
			organizationId: row.organizationId as IdentityAccess.OrganizationId,
			projectId: row.projectId as ProjectManagement.ProjectId,
			handle: MetaAdsAttribution.MetaAdAccountHandle.create(row.adAccountHandle),
			credentialId: row.credentialId,
			linkedAt: row.linkedAt,
			unlinkedAt: row.unlinkedAt,
		});
	}
}
