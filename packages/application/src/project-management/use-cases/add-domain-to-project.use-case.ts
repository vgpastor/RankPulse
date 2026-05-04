import { ProjectManagement, type SharedKernel } from '@rankpulse/domain';
import { type Clock, NotFoundError } from '@rankpulse/shared';

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
		project.addDomain(domain, cmd.kind ?? 'alias', this.clock.now());
		await this.projects.save(project);
		await this.events.publish(project.pullEvents());
	}
}
