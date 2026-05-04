import { InvalidInputError } from '@rankpulse/shared';
import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { DomainName } from '../../project-management/value-objects/domain-name.js';
import type { PortfolioId, ProjectId } from '../../project-management/value-objects/identifiers.js';

export const CredentialScopeTypes = {
	ORG: 'org',
	PORTFOLIO: 'portfolio',
	PROJECT: 'project',
	DOMAIN: 'domain',
} as const;

export type CredentialScopeType = (typeof CredentialScopeTypes)[keyof typeof CredentialScopeTypes];

const SPECIFICITY: Record<CredentialScopeType, number> = {
	domain: 4,
	project: 3,
	portfolio: 2,
	org: 1,
};

/**
 * Scope to which a credential is bound. Resolution searches from most specific
 * (domain) to least specific (org), so an org-level fallback can coexist with
 * per-project overrides for the same provider.
 */
export class CredentialScope {
	private constructor(
		public readonly type: CredentialScopeType,
		public readonly id: string,
	) {}

	static org(orgId: OrganizationId): CredentialScope {
		return new CredentialScope(CredentialScopeTypes.ORG, orgId);
	}

	static portfolio(portfolioId: PortfolioId): CredentialScope {
		return new CredentialScope(CredentialScopeTypes.PORTFOLIO, portfolioId);
	}

	static project(projectId: ProjectId): CredentialScope {
		return new CredentialScope(CredentialScopeTypes.PROJECT, projectId);
	}

	static domain(domain: DomainName): CredentialScope {
		return new CredentialScope(CredentialScopeTypes.DOMAIN, domain.value);
	}

	static fromRaw(input: { type: string; id: string }): CredentialScope {
		const type = input.type.toLowerCase() as CredentialScopeType;
		if (!isCredentialScopeType(type)) {
			throw new InvalidInputError(`Invalid credential scope type: ${input.type}`);
		}
		const id = input.id.trim();
		if (id.length === 0) {
			throw new InvalidInputError('Credential scope id cannot be empty');
		}
		return new CredentialScope(type, id);
	}

	specificity(): number {
		return SPECIFICITY[this.type];
	}

	isMoreSpecificThan(other: CredentialScope): boolean {
		return this.specificity() > other.specificity();
	}

	equals(other: CredentialScope): boolean {
		return this.type === other.type && this.id === other.id;
	}

	toString(): string {
		return `${this.type}:${this.id}`;
	}
}

export const isCredentialScopeType = (value: string): value is CredentialScopeType =>
	value === 'org' || value === 'portfolio' || value === 'project' || value === 'domain';
