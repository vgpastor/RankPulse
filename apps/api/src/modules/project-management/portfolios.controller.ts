import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post } from '@nestjs/common';
import type { ProjectManagement as PMUseCases } from '@rankpulse/application';
import { ProjectManagementContracts } from '@rankpulse/contracts';
import type { IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';
import type { AuthPrincipal } from '../../common/auth/jwt.service.js';
import { OrgMembership } from '../../common/auth/org-membership.guard.js';
import { Principal } from '../../common/auth/principal.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { Tokens } from '../../composition/tokens.js';

type CreatePortfolioRequest = ProjectManagementContracts.CreatePortfolioRequest;
type RenamePortfolioRequest = ProjectManagementContracts.RenamePortfolioRequest;
type PortfolioDto = ProjectManagementContracts.PortfolioDto;

/**
 * BACKLOG #11. Until now Portfolio rows could only be created via raw SQL.
 * These endpoints expose the full lifecycle. Auth: every action requires
 * org membership of the portfolio's organizationId — DELETE additionally
 * requires zero attached projects (use cases enforce that).
 */
@Controller()
export class PortfoliosController {
	private readonly orgMembership: OrgMembership;

	constructor(
		@Inject(Tokens.CreatePortfolio) private readonly createUC: PMUseCases.CreatePortfolioUseCase,
		@Inject(Tokens.ListPortfolios) private readonly listUC: PMUseCases.ListPortfoliosUseCase,
		@Inject(Tokens.GetPortfolio) private readonly getUC: PMUseCases.GetPortfolioUseCase,
		@Inject(Tokens.RenamePortfolio) private readonly renameUC: PMUseCases.RenamePortfolioUseCase,
		@Inject(Tokens.DeletePortfolio) private readonly deleteUC: PMUseCases.DeletePortfolioUseCase,
		@Inject(Tokens.PortfolioRepository)
		private readonly portfolios: ProjectManagement.PortfolioRepository,
		@Inject(Tokens.MembershipRepository) memberships: IdentityAccess.MembershipRepository,
	) {
		this.orgMembership = new OrgMembership(memberships);
	}

	private async requireMembership(
		principal: AuthPrincipal,
		portfolioId: string,
	): Promise<ProjectManagement.Portfolio> {
		const portfolio = await this.portfolios.findById(portfolioId as ProjectManagement.PortfolioId);
		if (!portfolio) throw new NotFoundError(`Portfolio ${portfolioId} not found`);
		await this.orgMembership.require(principal, portfolio.organizationId);
		return portfolio;
	}

	@Post('organizations/:orgId/portfolios')
	async createPortfolio(
		@Principal() principal: AuthPrincipal,
		@Param('orgId') orgId: string,
		@Body(new ZodValidationPipe(ProjectManagementContracts.CreatePortfolioRequest))
		body: CreatePortfolioRequest,
	): Promise<{ portfolioId: string }> {
		await this.orgMembership.require(principal, orgId as IdentityAccess.OrganizationId);
		return this.createUC.execute({ organizationId: orgId, name: body.name });
	}

	@Get('organizations/:orgId/portfolios')
	async listPortfolios(
		@Principal() principal: AuthPrincipal,
		@Param('orgId') orgId: string,
	): Promise<PortfolioDto[]> {
		await this.orgMembership.require(principal, orgId as IdentityAccess.OrganizationId);
		return this.listUC.execute(orgId);
	}

	@Get('portfolios/:id')
	async getPortfolio(@Principal() principal: AuthPrincipal, @Param('id') id: string): Promise<PortfolioDto> {
		await this.requireMembership(principal, id);
		return this.getUC.execute(id);
	}

	@Patch('portfolios/:id')
	async rename(
		@Principal() principal: AuthPrincipal,
		@Param('id') id: string,
		@Body(new ZodValidationPipe(ProjectManagementContracts.RenamePortfolioRequest))
		body: RenamePortfolioRequest,
	): Promise<PortfolioDto> {
		await this.requireMembership(principal, id);
		return this.renameUC.execute({ portfolioId: id, name: body.name });
	}

	@Delete('portfolios/:id')
	@HttpCode(204)
	async deletePortfolio(@Principal() principal: AuthPrincipal, @Param('id') id: string): Promise<void> {
		await this.requireMembership(principal, id);
		await this.deleteUC.execute(id);
	}
}
