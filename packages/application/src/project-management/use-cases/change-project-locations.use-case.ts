import { ProjectManagement, type SharedKernel } from '@rankpulse/domain';
import { type Clock, NotFoundError } from '@rankpulse/shared';

export interface AddProjectLocationCommand {
	projectId: string;
	country: string;
	language: string;
}

export class AddProjectLocationUseCase {
	constructor(
		private readonly projects: ProjectManagement.ProjectRepository,
		private readonly clock: Clock,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: AddProjectLocationCommand): Promise<void> {
		const project = await this.projects.findById(cmd.projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${cmd.projectId} not found`);
		}
		const location = ProjectManagement.LocationLanguage.create({
			country: cmd.country,
			language: cmd.language,
		});
		project.addLocation(location, this.clock.now());
		await this.projects.save(project);
		await this.events.publish(project.pullEvents());
	}
}
