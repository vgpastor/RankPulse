import { ProjectManagement, type SharedKernel } from '@rankpulse/domain';
import { type Clock, type IdGenerator, NotFoundError } from '@rankpulse/shared';

export interface AddCompetitorCommand {
	projectId: string;
	domain: string;
	label?: string;
}

export interface AddCompetitorResult {
	competitorId: string;
	/**
	 * `true` when this call created a new competitor; `false` when the
	 * competitor already existed and the call only re-emitted
	 * `CompetitorAdded` to backfill any missing feeders. Lets the
	 * controller pick the right HTTP status (201 vs 200).
	 */
	created: boolean;
}

/**
 * Idempotent add. If the competitor already exists for this project,
 * the call returns the existing id WITHOUT throwing — and re-publishes
 * `CompetitorAdded` so the auto-schedule handlers can backfill any
 * feeders missing from the JobDefinition table.
 *
 * Why re-publish on the idempotent path: `ScheduleEndpointFetchUseCase`
 * has its own idempotency check via `systemParamKey + value`, so
 * existing healthy schedules are no-ops. But schedules that were
 * deleted (operator cleanup of broken jobs) or schedules whose
 * auto-schedule handler didn't exist when the competitor was first
 * added (e.g. wayback + backlinks were wired in PR #185) will be
 * created. This makes `POST /competitors` a safe "ensure-and-refeed"
 * operation, removing the need for a DELETE + POST cycle that would
 * lose run history.
 */
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
			await this.events.publish([
				new ProjectManagement.CompetitorAdded({
					competitorId: existing.id,
					projectId,
					domain: domain.value,
					label: existing.label,
					occurredAt: this.clock.now(),
				}),
			]);
			return { competitorId: existing.id, created: false };
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

		await this.events.publish([
			new ProjectManagement.CompetitorAdded({
				competitorId,
				projectId,
				domain: domain.value,
				label: competitor.label,
				occurredAt: this.clock.now(),
			}),
		]);

		return { competitorId, created: true };
	}
}
