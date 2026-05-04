import { ProjectManagement, type SharedKernel } from '@rankpulse/domain';
import { type Clock, ConflictError, type IdGenerator, NotFoundError } from '@rankpulse/shared';

export interface AddCompetitorCommand {
	projectId: string;
	domain: string;
	label?: string;
}

export interface AddCompetitorResult {
	competitorId: string;
}

export class AddCompetitorUseCase {
	constructor(
		private readonly projects: ProjectManagement.ProjectRepository,
		private readonly competitors: ProjectManagement.CompetitorRepository,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: AddCompetitorCommand): Promise<AddCompetitorResult> {
		const projectId = cmd.projectId as ProjectManagement.ProjectId;
		const project = await this.projects.findById(projectId);
		if (!project) {
			throw new NotFoundError(`Project ${cmd.projectId} not found`);
		}

		const domain = ProjectManagement.DomainName.create(cmd.domain);
		const existing = await this.competitors.findByDomain(projectId, domain);
		if (existing) {
			throw new ConflictError(`Competitor "${domain.value}" already tracked for this project`);
		}

		const competitorId = this.ids.generate() as ProjectManagement.CompetitorId;
		const competitor = ProjectManagement.Competitor.add({
			id: competitorId,
			projectId,
			domain,
			label: cmd.label,
			now: this.clock.now(),
		});
		await this.competitors.save(competitor);

		const event = new ProjectManagement.CompetitorAdded({
			competitorId,
			projectId,
			domain: domain.value,
			label: competitor.label,
			occurredAt: this.clock.now(),
		});
		await this.events.publish([event]);

		return { competitorId };
	}
}
