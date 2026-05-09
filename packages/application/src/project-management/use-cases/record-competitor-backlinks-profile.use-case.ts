import { ProjectManagement } from '@rankpulse/domain';
import { type Clock, type IdGenerator, NotFoundError } from '@rankpulse/shared';

export interface RecordCompetitorBacklinksProfileCommand {
	competitorId: string;
	rawPayloadId: string | null;
	summary: {
		totalBacklinks: number;
		referringDomains: number;
		referringMainDomains: number;
		referringPages: number;
		brokenBacklinks: number;
		spamScore: number | null;
		rank: number | null;
	};
}

/**
 * Persists one DataForSEO `backlinks/summary/live` row as a competitor-activity
 * observation. Same idempotency contract as the Wayback ingest:
 * `(competitor, source, observed_at::date)` is upserted on conflict.
 */
export class RecordCompetitorBacklinksProfileUseCase {
	constructor(
		private readonly competitors: ProjectManagement.CompetitorRepository,
		private readonly observations: ProjectManagement.CompetitorActivityObservationRepository,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
	) {}

	async execute(cmd: RecordCompetitorBacklinksProfileCommand): Promise<{ observationId: string }> {
		const competitorId = cmd.competitorId as ProjectManagement.CompetitorId;
		const competitor = await this.competitors.findById(competitorId);
		if (!competitor) {
			throw new NotFoundError(`Competitor ${cmd.competitorId} not found`);
		}
		const id = this.ids.generate() as ProjectManagement.CompetitorActivityObservationId;
		const observation = ProjectManagement.CompetitorActivityObservation.recordBacklinksProfile({
			id,
			projectId: competitor.projectId,
			competitorId,
			metrics: cmd.summary,
			rawPayloadId: cmd.rawPayloadId,
			now: this.clock.now(),
		});
		await this.observations.save(observation);
		return { observationId: id };
	}
}
