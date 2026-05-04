import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { Portfolio } from '../entities/portfolio.js';
import type { PortfolioId } from '../value-objects/identifiers.js';

export interface PortfolioRepository {
	save(portfolio: Portfolio): Promise<void>;
	findById(id: PortfolioId): Promise<Portfolio | null>;
	listForOrganization(orgId: OrganizationId): Promise<readonly Portfolio[]>;
}
