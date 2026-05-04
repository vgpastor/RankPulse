import { type IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { InvalidInputError } from '@rankpulse/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { projectDomains, projectLocations, projects } from '../../schema/index.js';

export class DrizzleProjectRepository implements ProjectManagement.ProjectRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(project: ProjectManagement.Project): Promise<void> {
		await this.db.transaction(async (tx) => {
			await tx
				.insert(projects)
				.values({
					id: project.id,
					organizationId: project.organizationId,
					portfolioId: project.portfolioId,
					name: project.name,
					primaryDomain: project.primaryDomain.value,
					kind: project.kind,
					archivedAt: project.archivedAt,
					createdAt: project.createdAt,
				})
				.onConflictDoUpdate({
					target: projects.id,
					set: {
						portfolioId: project.portfolioId,
						name: project.name,
						kind: project.kind,
						archivedAt: project.archivedAt,
					},
				});

			await tx.delete(projectDomains).where(eq(projectDomains.projectId, project.id));
			if (project.domains.length > 0) {
				await tx
					.insert(projectDomains)
					.values(
						project.domains.map((d) => ({ projectId: project.id, domain: d.domain.value, kind: d.kind })),
					);
			}

			await tx.delete(projectLocations).where(eq(projectLocations.projectId, project.id));
			if (project.locations.length > 0) {
				await tx.insert(projectLocations).values(
					project.locations.map((l) => ({
						projectId: project.id,
						country: l.country,
						language: l.language,
					})),
				);
			}
		});
	}

	async findById(id: ProjectManagement.ProjectId): Promise<ProjectManagement.Project | null> {
		const [row] = await this.db.select().from(projects).where(eq(projects.id, id)).limit(1);
		if (!row) return null;
		return this.assemble(row);
	}

	async findByPrimaryDomain(
		orgId: IdentityAccess.OrganizationId,
		domain: ProjectManagement.DomainName,
	): Promise<ProjectManagement.Project | null> {
		const [row] = await this.db
			.select()
			.from(projects)
			.where(and(eq(projects.organizationId, orgId), eq(projects.primaryDomain, domain.value)))
			.limit(1);
		if (!row) return null;
		return this.assemble(row);
	}

	async listForOrganization(
		orgId: IdentityAccess.OrganizationId,
	): Promise<readonly ProjectManagement.Project[]> {
		const rows = await this.db
			.select()
			.from(projects)
			.where(eq(projects.organizationId, orgId))
			.orderBy(desc(projects.createdAt));
		return Promise.all(rows.map((r) => this.assemble(r)));
	}

	private async assemble(row: typeof projects.$inferSelect): Promise<ProjectManagement.Project> {
		const [domains, locations] = await Promise.all([
			this.db.select().from(projectDomains).where(eq(projectDomains.projectId, row.id)),
			this.db.select().from(projectLocations).where(eq(projectLocations.projectId, row.id)),
		]);
		if (!ProjectManagement.isProjectKind(row.kind)) {
			throw new InvalidInputError(`Stored project has invalid kind "${row.kind}"`);
		}
		return ProjectManagement.Project.rehydrate({
			id: row.id as ProjectManagement.ProjectId,
			organizationId: row.organizationId as IdentityAccess.OrganizationId,
			portfolioId: (row.portfolioId as ProjectManagement.PortfolioId | null) ?? null,
			name: row.name,
			primaryDomain: ProjectManagement.DomainName.create(row.primaryDomain),
			kind: row.kind,
			domains: domains.map((d) => ({
				domain: ProjectManagement.DomainName.create(d.domain),
				kind: d.kind as 'main' | 'subdomain' | 'alias',
			})),
			locations: locations.map((l) =>
				ProjectManagement.LocationLanguage.create({ country: l.country, language: l.language }),
			),
			archivedAt: row.archivedAt,
			createdAt: row.createdAt,
		});
	}
}
