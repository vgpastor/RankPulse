import { type IdentityAccess, ProjectManagement, type SharedKernel } from '@rankpulse/domain';
import { type Clock, ConflictError, type IdGenerator } from '@rankpulse/shared';

export interface CreateProjectCommand {
	organizationId: string;
	portfolioId: string | null;
	name: string;
	primaryDomain: string;
	kind?: ProjectManagement.ProjectKind;
	initialLocations?: { country: string; language: string }[];
}

export interface CreateProjectResult {
	projectId: string;
}

export class CreateProjectUseCase {
	constructor(
		private readonly projects: ProjectManagement.ProjectRepository,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: CreateProjectCommand): Promise<CreateProjectResult> {
		const orgId = cmd.organizationId as IdentityAccess.OrganizationId;
		const domain = ProjectManagement.DomainName.create(cmd.primaryDomain);

		const existing = await this.projects.findByPrimaryDomain(orgId, domain);
		if (existing) {
			throw new ConflictError(`A project for "${domain.value}" already exists in this organization`);
		}

		const initialLocations =
			cmd.initialLocations?.map((l) => ProjectManagement.LocationLanguage.create(l)) ?? [];

		const projectId = this.ids.generate() as ProjectManagement.ProjectId;
		const portfolioId = cmd.portfolioId ? (cmd.portfolioId as ProjectManagement.PortfolioId) : null;

		const project = ProjectManagement.Project.create({
			id: projectId,
			organizationId: orgId,
			portfolioId,
			name: cmd.name,
			primaryDomain: domain,
			kind: cmd.kind,
			initialLocations,
			now: this.clock.now(),
		});

		await this.projects.save(project);
		await this.events.publish(project.pullEvents());

		return { projectId };
	}
}
