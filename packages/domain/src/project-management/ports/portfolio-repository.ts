import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { Portfolio } from '../entities/portfolio.js';
import type { PortfolioId } from '../value-objects/identifiers.js';

export interface PortfolioRepository {
	save(portfolio: Portfolio): Promise<void>;
	findById(id: PortfolioId): Promise<Portfolio | null>;
	listForOrganization(orgId: OrganizationId): Promise<readonly Portfolio[]>;
	delete(id: PortfolioId): Promise<void>;
	/**
	 * Returns how many projects reference this portfolio. The Delete use case
	 * uses it to refuse deletion when projects still hang off the portfolio
	 * — we never want to silently NULL `projects.portfolio_id` on a user
	 * action.
	 */
	countProjects(id: PortfolioId): Promise<number>;
}
