import { type IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { desc, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { portfolios } from '../../schema/index.js';

export class DrizzlePortfolioRepository implements ProjectManagement.PortfolioRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(portfolio: ProjectManagement.Portfolio): Promise<void> {
		await this.db
			.insert(portfolios)
			.values({
				id: portfolio.id,
				organizationId: portfolio.organizationId,
				name: portfolio.name,
				createdAt: portfolio.createdAt,
			})
			.onConflictDoUpdate({
				target: portfolios.id,
				set: { name: portfolio.name },
			});
	}

	async findById(id: ProjectManagement.PortfolioId): Promise<ProjectManagement.Portfolio | null> {
		const [row] = await this.db.select().from(portfolios).where(eq(portfolios.id, id)).limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async listForOrganization(
		orgId: IdentityAccess.OrganizationId,
	): Promise<readonly ProjectManagement.Portfolio[]> {
		const rows = await this.db
			.select()
			.from(portfolios)
			.where(eq(portfolios.organizationId, orgId))
			.orderBy(desc(portfolios.createdAt));
		return rows.map((r) => this.toAggregate(r));
	}

	private toAggregate(row: typeof portfolios.$inferSelect): ProjectManagement.Portfolio {
		return ProjectManagement.Portfolio.rehydrate({
			id: row.id as ProjectManagement.PortfolioId,
			organizationId: row.organizationId as IdentityAccess.OrganizationId,
			name: row.name,
			createdAt: row.createdAt,
		});
	}
}
