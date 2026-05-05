import {
	type IdentityAccess,
	type ProjectManagement,
	type SharedKernel,
	WebPerformance,
} from '@rankpulse/domain';
import { type Clock, ConflictError, type IdGenerator } from '@rankpulse/shared';

export interface TrackPageCommand {
	organizationId: string;
	projectId: string;
	url: string;
	strategy: WebPerformance.PageSpeedStrategy;
}

export interface TrackPageResult {
	trackedPageId: string;
}

/**
 * Operator action: start tracking a (URL, strategy) pair for PSI runs.
 * Idempotent at the domain level — if the same tuple is already
 * tracked, throws ConflictError. The repo's unique index is the
 * second line of defence against the find→save race.
 */
export class TrackPageUseCase {
	constructor(
		private readonly trackedPages: WebPerformance.TrackedPageRepository,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: TrackPageCommand): Promise<TrackPageResult> {
		const url = WebPerformance.PageUrl.create(cmd.url);
		const projectId = cmd.projectId as ProjectManagement.ProjectId;

		const existing = await this.trackedPages.findByTuple(projectId, url, cmd.strategy);
		if (existing) {
			throw new ConflictError(
				`Page "${url.value}" with strategy "${cmd.strategy}" is already tracked for this project`,
			);
		}

		const id = this.ids.generate() as WebPerformance.TrackedPageId;
		const page = WebPerformance.TrackedPage.add({
			id,
			organizationId: cmd.organizationId as IdentityAccess.OrganizationId,
			projectId,
			url,
			strategy: cmd.strategy,
			now: this.clock.now(),
		});
		await this.trackedPages.save(page);
		await this.events.publish(page.pullEvents());

		return { trackedPageId: id };
	}
}
