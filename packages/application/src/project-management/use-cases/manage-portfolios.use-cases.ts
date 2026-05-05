import { type IdentityAccess, ProjectManagement, type SharedKernel } from '@rankpulse/domain';
import { type Clock, ConflictError, type IdGenerator, NotFoundError } from '@rankpulse/shared';

export interface PortfolioView {
	id: string;
	organizationId: string;
	name: string;
	createdAt: string;
	projectCount: number;
}

const toView = (p: ProjectManagement.Portfolio, projectCount: number): PortfolioView => ({
	id: p.id,
	organizationId: p.organizationId,
	name: p.name,
	createdAt: p.createdAt.toISOString(),
	projectCount,
});

export interface CreatePortfolioCommand {
	organizationId: string;
	name: string;
}

export class CreatePortfolioUseCase {
	constructor(
		private readonly portfolios: ProjectManagement.PortfolioRepository,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: CreatePortfolioCommand): Promise<{ portfolioId: string }> {
		const id = this.ids.generate() as ProjectManagement.PortfolioId;
		const portfolio = ProjectManagement.Portfolio.create({
			id,
			organizationId: cmd.organizationId as IdentityAccess.OrganizationId,
			name: cmd.name,
			now: this.clock.now(),
		});
		await this.portfolios.save(portfolio);
		await this.events.publish(portfolio.pullEvents());
		return { portfolioId: id };
	}
}

export class ListPortfoliosUseCase {
	constructor(private readonly portfolios: ProjectManagement.PortfolioRepository) {}

	async execute(organizationId: string): Promise<PortfolioView[]> {
		const list = await this.portfolios.listForOrganization(organizationId as IdentityAccess.OrganizationId);
		return Promise.all(list.map(async (p) => toView(p, await this.portfolios.countProjects(p.id))));
	}
}

export class GetPortfolioUseCase {
	constructor(private readonly portfolios: ProjectManagement.PortfolioRepository) {}

	async execute(portfolioId: string): Promise<PortfolioView> {
		const id = portfolioId as ProjectManagement.PortfolioId;
		const portfolio = await this.portfolios.findById(id);
		if (!portfolio) throw new NotFoundError(`Portfolio ${portfolioId} not found`);
		return toView(portfolio, await this.portfolios.countProjects(id));
	}
}

export interface RenamePortfolioCommand {
	portfolioId: string;
	name: string;
}

export class RenamePortfolioUseCase {
	constructor(private readonly portfolios: ProjectManagement.PortfolioRepository) {}

	async execute(cmd: RenamePortfolioCommand): Promise<PortfolioView> {
		const id = cmd.portfolioId as ProjectManagement.PortfolioId;
		const portfolio = await this.portfolios.findById(id);
		if (!portfolio) throw new NotFoundError(`Portfolio ${cmd.portfolioId} not found`);
		portfolio.rename(cmd.name);
		await this.portfolios.save(portfolio);
		return toView(portfolio, await this.portfolios.countProjects(id));
	}
}

export class DeletePortfolioUseCase {
	constructor(private readonly portfolios: ProjectManagement.PortfolioRepository) {}

	async execute(portfolioId: string): Promise<void> {
		const id = portfolioId as ProjectManagement.PortfolioId;
		const portfolio = await this.portfolios.findById(id);
		if (!portfolio) throw new NotFoundError(`Portfolio ${portfolioId} not found`);
		const projectCount = await this.portfolios.countProjects(id);
		if (projectCount > 0) {
			throw new ConflictError(
				`Portfolio ${portfolio.name} (${id}) still has ${projectCount} project(s) attached — reassign them before deleting.`,
			);
		}
		await this.portfolios.delete(id);
	}
}
