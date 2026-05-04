import type { IdentityAccess } from '@rankpulse/domain';
import { ProjectManagement } from '@rankpulse/domain';
import { Uuid } from '@rankpulse/shared';

export const aDomain = (raw = 'controlrondas.com') => ProjectManagement.DomainName.create(raw);

export const aLocation = (country = 'ES', language = 'es') =>
	ProjectManagement.LocationLanguage.create({ country, language });

export const aProject = (
	overrides: Partial<{
		id: ProjectManagement.ProjectId;
		organizationId: IdentityAccess.OrganizationId;
		portfolioId: ProjectManagement.PortfolioId | null;
		name: string;
		primaryDomain: ProjectManagement.DomainName;
		kind: ProjectManagement.ProjectKind;
		initialLocations: ProjectManagement.LocationLanguage[];
		now: Date;
	}> = {},
) =>
	ProjectManagement.Project.create({
		id: overrides.id ?? (Uuid.generate() as ProjectManagement.ProjectId),
		organizationId: overrides.organizationId ?? (Uuid.generate() as IdentityAccess.OrganizationId),
		portfolioId: overrides.portfolioId ?? null,
		name: overrides.name ?? 'PatrolTech',
		primaryDomain: overrides.primaryDomain ?? aDomain(),
		kind: overrides.kind,
		initialLocations: overrides.initialLocations,
		now: overrides.now ?? new Date('2026-05-04T10:00:00Z'),
	});
