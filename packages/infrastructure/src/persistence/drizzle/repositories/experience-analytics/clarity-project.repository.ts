import { ExperienceAnalytics, type IdentityAccess, type ProjectManagement } from '@rankpulse/domain';
import { ConflictError } from '@rankpulse/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { clarityProjects } from '../../schema/index.js';
import { DrizzleRepository } from '../_base.js';

const UNIQUE_TUPLE_CONSTRAINT = 'clarity_projects_project_handle_unique';

const isUniqueViolation = (err: unknown): boolean => {
	if (!err || typeof err !== 'object') return false;
	const e = err as { code?: string; constraint_name?: string; constraint?: string };
	if (e.code !== '23505') return false;
	const constraint = e.constraint_name ?? e.constraint;
	return constraint === UNIQUE_TUPLE_CONSTRAINT;
};

type ClarityProjectRow = typeof clarityProjects.$inferSelect;

export class DrizzleClarityProjectRepository
	extends DrizzleRepository<ExperienceAnalytics.ClarityProject, ClarityProjectRow>
	implements ExperienceAnalytics.ClarityProjectRepository
{
	constructor(db: DrizzleDatabase) {
		super(db, clarityProjects);
	}

	async save(cp: ExperienceAnalytics.ClarityProject): Promise<void> {
		try {
			await this.db
				.insert(clarityProjects)
				.values({
					id: cp.id,
					organizationId: cp.organizationId,
					projectId: cp.projectId,
					clarityHandle: cp.clarityHandle.value,
					credentialId: cp.credentialId,
					linkedAt: cp.linkedAt,
					unlinkedAt: cp.unlinkedAt,
				})
				.onConflictDoUpdate({
					target: clarityProjects.id,
					set: {
						clarityHandle: cp.clarityHandle.value,
						credentialId: cp.credentialId,
						unlinkedAt: cp.unlinkedAt,
					},
				});
		} catch (err) {
			if (isUniqueViolation(err)) {
				throw new ConflictError(
					`Clarity project "${cp.clarityHandle.value}" is already linked to project ${cp.projectId}`,
				);
			}
			throw err;
		}
	}

	// findById inherited from DrizzleRepository<TAggregate, TRow>.

	async findByProjectAndHandle(
		projectId: ProjectManagement.ProjectId,
		clarityHandle: string,
	): Promise<ExperienceAnalytics.ClarityProject | null> {
		const handle = ExperienceAnalytics.ClarityProjectHandle.create(clarityHandle);
		const [row] = await this.db
			.select()
			.from(clarityProjects)
			.where(and(eq(clarityProjects.projectId, projectId), eq(clarityProjects.clarityHandle, handle.value)))
			.limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async listForProject(
		projectId: ProjectManagement.ProjectId,
	): Promise<readonly ExperienceAnalytics.ClarityProject[]> {
		const rows = await this.db
			.select()
			.from(clarityProjects)
			.where(eq(clarityProjects.projectId, projectId))
			.orderBy(desc(clarityProjects.linkedAt));
		return rows.map((r) => this.toAggregate(r));
	}

	async listForOrganization(
		orgId: IdentityAccess.OrganizationId,
	): Promise<readonly ExperienceAnalytics.ClarityProject[]> {
		const rows = await this.db
			.select()
			.from(clarityProjects)
			.where(eq(clarityProjects.organizationId, orgId))
			.orderBy(desc(clarityProjects.linkedAt));
		return rows.map((r) => this.toAggregate(r));
	}

	protected toAggregate(row: ClarityProjectRow): ExperienceAnalytics.ClarityProject {
		return ExperienceAnalytics.ClarityProject.rehydrate({
			id: row.id as ExperienceAnalytics.ClarityProjectId,
			organizationId: row.organizationId as IdentityAccess.OrganizationId,
			projectId: row.projectId as ProjectManagement.ProjectId,
			clarityHandle: ExperienceAnalytics.ClarityProjectHandle.create(row.clarityHandle),
			credentialId: row.credentialId,
			linkedAt: row.linkedAt,
			unlinkedAt: row.unlinkedAt,
		});
	}
}
