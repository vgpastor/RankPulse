import { ProjectManagement } from '@rankpulse/domain';
import { type Clock, type IdGenerator, InvalidInputError, NotFoundError } from '@rankpulse/shared';

export interface RecordProjectAuthorityProfileCommand {
	projectId: string;
	/** The domain the reading was taken against. Must belong to the project. */
	domain: string;
	rawPayloadId: string | null;
	summary: ProjectManagement.BacklinksProfileMetrics;
}

/**
 * Persists one DataForSEO `backlinks/summary/live` row taken against one of
 * the project's domains.
 *
 * A project is a set of domains, not one: the network's satellites live as
 * secondary domains of four projects, and they are exactly the ones whose
 * authority was unknown. So the reading is keyed by domain, and the domain
 * is checked against the project rather than trusted from the schedule — a
 * definition pointed at a stranger's domain cannot be filed as ours.
 */
export class RecordProjectAuthorityProfileUseCase {
	constructor(
		private readonly projects: ProjectManagement.ProjectRepository,
		private readonly observations: ProjectManagement.DomainAuthorityObservationRepository,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
	) {}

	async execute(cmd: RecordProjectAuthorityProfileCommand): Promise<{ observationId: string }> {
		const projectId = cmd.projectId as ProjectManagement.ProjectId;
		const project = await this.projects.findById(projectId);
		if (!project) {
			throw new NotFoundError(`Project ${cmd.projectId} not found`);
		}
		const domain = ProjectManagement.DomainName.create(cmd.domain);
		if (!project.domains.some((d) => d.domain.equals(domain))) {
			throw new InvalidInputError(`Domain ${domain.value} does not belong to project ${cmd.projectId}`);
		}
		const id = this.ids.generate() as ProjectManagement.DomainAuthorityObservationId;
		const observation = ProjectManagement.DomainAuthorityObservation.record({
			id,
			projectId,
			domain: domain.value,
			metrics: cmd.summary,
			rawPayloadId: cmd.rawPayloadId,
			now: this.clock.now(),
		});
		await this.observations.save(observation);
		return { observationId: id };
	}
}
