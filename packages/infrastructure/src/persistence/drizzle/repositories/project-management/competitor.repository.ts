import { ProjectManagement } from '@rankpulse/domain';
import { ConflictError } from '@rankpulse/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { competitors } from '../../schema/index.js';

const UNIQUE_PROJECT_DOMAIN_CONSTRAINT = 'competitors_project_domain_unique';

const isProjectDomainUniqueViolation = (err: unknown): boolean => {
	if (!err || typeof err !== 'object') return false;
	const e = err as { code?: string; constraint_name?: string; constraint?: string };
	if (e.code !== '23505') return false;
	const constraint = e.constraint_name ?? e.constraint;
	return constraint === UNIQUE_PROJECT_DOMAIN_CONSTRAINT;
};

export class DrizzleCompetitorRepository implements ProjectManagement.CompetitorRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(competitor: ProjectManagement.Competitor): Promise<void> {
		try {
			await this.db
				.insert(competitors)
				.values({
					id: competitor.id,
					projectId: competitor.projectId,
					domain: competitor.domain.value,
					label: competitor.label,
					createdAt: competitor.createdAt,
				})
				.onConflictDoUpdate({
					target: competitors.id,
					set: { label: competitor.label },
				});
		} catch (err) {
			// BACKLOG #2 fix — promoting the same suggestion twice (or
			// adding a duplicate domain via the legacy AddCompetitor path)
			// would otherwise surface as a raw 500. Map it to a typed
			// ConflictError so the controller can return a clean 409.
			if (isProjectDomainUniqueViolation(err)) {
				throw new ConflictError(
					`Competitor "${competitor.domain.value}" already tracked for project ${competitor.projectId}`,
				);
			}
			throw err;
		}
	}

	async findById(id: ProjectManagement.CompetitorId): Promise<ProjectManagement.Competitor | null> {
		const [row] = await this.db.select().from(competitors).where(eq(competitors.id, id)).limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async findByDomain(
		projectId: ProjectManagement.ProjectId,
		domain: ProjectManagement.DomainName,
	): Promise<ProjectManagement.Competitor | null> {
		const [row] = await this.db
			.select()
			.from(competitors)
			.where(and(eq(competitors.projectId, projectId), eq(competitors.domain, domain.value)))
			.limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async listForProject(
		projectId: ProjectManagement.ProjectId,
	): Promise<readonly ProjectManagement.Competitor[]> {
		const rows = await this.db
			.select()
			.from(competitors)
			.where(eq(competitors.projectId, projectId))
			.orderBy(desc(competitors.createdAt));
		return rows.map((r) => this.toAggregate(r));
	}

	private toAggregate(row: typeof competitors.$inferSelect): ProjectManagement.Competitor {
		return ProjectManagement.Competitor.rehydrate({
			id: row.id as ProjectManagement.CompetitorId,
			projectId: row.projectId as ProjectManagement.ProjectId,
			domain: ProjectManagement.DomainName.create(row.domain),
			label: row.label,
			createdAt: row.createdAt,
		});
	}
}
