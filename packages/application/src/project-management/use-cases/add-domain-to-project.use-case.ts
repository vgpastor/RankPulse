import { ProjectManagement, type SharedKernel } from '@rankpulse/domain';
import { type Clock, ConflictError, NotFoundError } from '@rankpulse/shared';

export interface AddDomainToProjectCommand {
	projectId: string;
	domain: string;
	kind?: 'main' | 'subdomain' | 'alias';
}

export class AddDomainToProjectUseCase {
	constructor(
		private readonly projects: ProjectManagement.ProjectRepository,
		private readonly clock: Clock,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: AddDomainToProjectCommand): Promise<void> {
		const project = await this.projects.findById(cmd.projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${cmd.projectId} not found`);
		}
		const domain = ProjectManagement.DomainName.create(cmd.domain);

		// BACKLOG #24: distinguish "already in this project" (caught by the
		// aggregate's invariant below) from "already in ANOTHER project of
		// the same org" (the cross-project unique constraint hits at save
		// time with an opaque DB error otherwise — pre-empt it here with a
		// useful message).
		const owner = await this.projects.findByDomainInOrganization(project.organizationId, domain);
		if (owner && owner.id !== project.id) {
			throw new ConflictError(
				`Domain ${domain.value} is already attached to project "${owner.name}" (${owner.id}) in this organization`,
			);
		}

		project.addDomain(domain, cmd.kind ?? 'alias', this.clock.now());
		await this.projects.save(project);
		await this.events.publish(project.pullEvents());
	}
}
