import { ConflictError, InvalidInputError } from '@rankpulse/shared';
import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import { DomainAdded } from '../events/domain-added.js';
import { LocationAdded } from '../events/location-added.js';
import { ProjectCreated } from '../events/project-created.js';
import type { DomainName } from '../value-objects/domain-name.js';
import type { PortfolioId, ProjectId } from '../value-objects/identifiers.js';
import type { LocationLanguage } from '../value-objects/location-language.js';
import { type ProjectKind, ProjectKinds } from '../value-objects/project-kind.js';

export interface ProjectDomainEntry {
	domain: DomainName;
	kind: 'main' | 'subdomain' | 'alias';
}

export interface ProjectProps {
	id: ProjectId;
	organizationId: OrganizationId;
	portfolioId: PortfolioId | null;
	name: string;
	primaryDomain: DomainName;
	kind: ProjectKind;
	domains: ProjectDomainEntry[];
	locations: LocationLanguage[];
	archivedAt: Date | null;
	createdAt: Date;
}

export class Project extends AggregateRoot {
	private constructor(private props: ProjectProps) {
		super();
	}

	static create(input: {
		id: ProjectId;
		organizationId: OrganizationId;
		portfolioId: PortfolioId | null;
		name: string;
		primaryDomain: DomainName;
		kind?: ProjectKind;
		initialLocations?: LocationLanguage[];
		now: Date;
	}): Project {
		const name = input.name.trim();
		if (name.length < 2) {
			throw new InvalidInputError('Project name must be at least 2 characters');
		}

		const project = new Project({
			id: input.id,
			organizationId: input.organizationId,
			portfolioId: input.portfolioId,
			name,
			primaryDomain: input.primaryDomain,
			kind: input.kind ?? ProjectKinds.OWN,
			domains: [{ domain: input.primaryDomain, kind: 'main' }],
			locations: [...(input.initialLocations ?? [])],
			archivedAt: null,
			createdAt: input.now,
		});
		project.record(
			new ProjectCreated({
				projectId: input.id,
				organizationId: input.organizationId,
				portfolioId: input.portfolioId,
				primaryDomain: input.primaryDomain.value,
				kind: project.props.kind,
				occurredAt: input.now,
			}),
		);
		return project;
	}

	static rehydrate(props: ProjectProps): Project {
		return new Project({ ...props, domains: [...props.domains], locations: [...props.locations] });
	}

	addDomain(domain: DomainName, kind: ProjectDomainEntry['kind'], now: Date): void {
		this.assertNotArchived();
		if (this.props.domains.some((d) => d.domain.equals(domain))) {
			throw new ConflictError(`Domain ${domain.value} already attached to project`);
		}
		this.props.domains.push({ domain, kind });
		this.record(
			new DomainAdded({
				projectId: this.props.id,
				domain: domain.value,
				kind,
				occurredAt: now,
			}),
		);
	}

	addLocation(location: LocationLanguage, now: Date): void {
		this.assertNotArchived();
		if (this.props.locations.some((l) => l.equals(location))) {
			throw new ConflictError(`Location ${location.toString()} already targeted`);
		}
		this.props.locations.push(location);
		this.record(
			new LocationAdded({
				projectId: this.props.id,
				country: location.country,
				language: location.language,
				occurredAt: now,
			}),
		);
	}

	archive(now: Date): void {
		if (this.props.archivedAt) return;
		this.props = { ...this.props, archivedAt: now };
	}

	isArchived(): boolean {
		return this.props.archivedAt !== null;
	}

	private assertNotArchived(): void {
		if (this.props.archivedAt) {
			throw new ConflictError('Cannot modify an archived project');
		}
	}

	get id(): ProjectId {
		return this.props.id;
	}
	get organizationId(): OrganizationId {
		return this.props.organizationId;
	}
	get portfolioId(): PortfolioId | null {
		return this.props.portfolioId;
	}
	get name(): string {
		return this.props.name;
	}
	get primaryDomain(): DomainName {
		return this.props.primaryDomain;
	}
	get kind(): ProjectKind {
		return this.props.kind;
	}
	get domains(): readonly ProjectDomainEntry[] {
		return this.props.domains;
	}
	get locations(): readonly LocationLanguage[] {
		return this.props.locations;
	}
	get archivedAt(): Date | null {
		return this.props.archivedAt;
	}
	get createdAt(): Date {
		return this.props.createdAt;
	}
}
