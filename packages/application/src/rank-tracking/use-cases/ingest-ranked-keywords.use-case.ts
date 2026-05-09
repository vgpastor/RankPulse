import { type ProjectManagement, RankTracking } from '@rankpulse/domain';
import { type IdGenerator, NotFoundError } from '@rankpulse/shared';

export interface RankedKeywordInput {
	keyword: string;
	position: number | null;
	rankingUrl: string | null;
	searchVolume: number | null;
	keywordDifficulty: number | null;
	trafficEstimate: number | null;
	cpc: number | null;
}

export interface IngestRankedKeywordsCommand {
	projectId: string;
	targetDomain: string;
	country: string;
	language: string;
	rows: readonly RankedKeywordInput[];
	rawPayloadId: string | null;
	observedAt?: Date;
}

export interface IngestRankedKeywordsResult {
	ingested: number;
}

const SOURCE_PROVIDER = 'dataforseo';

/**
 * Issue #127: persists a snapshot of the keyword universe for a target domain
 * (one row per keyword) into `ranked_keywords_observations`. The full
 * snapshot is treated as a single batch — the natural-key PK on the
 * hypertable absorbs idempotent re-runs within the same `observed_at`.
 *
 * No domain events are emitted: this is a passive read-model, not an
 * alerting source. If product needs decay/loss alerts, a derived materialiser
 * would aggregate over the hypertable instead of attaching events here.
 */
export class IngestRankedKeywordsUseCase {
	constructor(
		private readonly projects: ProjectManagement.ProjectRepository,
		private readonly observations: RankTracking.RankedKeywordObservationRepository,
		private readonly ids: IdGenerator,
	) {}

	async execute(cmd: IngestRankedKeywordsCommand): Promise<IngestRankedKeywordsResult> {
		if (cmd.rows.length === 0) {
			return { ingested: 0 };
		}
		const project = await this.projects.findById(cmd.projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${cmd.projectId} not found`);
		}
		const observedAt = cmd.observedAt ?? new Date();
		const observations = cmd.rows.map((row) =>
			RankTracking.RankedKeywordObservation.record({
				id: this.ids.generate() as RankTracking.RankedKeywordObservationId,
				projectId: project.id,
				targetDomain: cmd.targetDomain,
				keyword: row.keyword,
				country: cmd.country,
				language: cmd.language,
				position: row.position,
				searchVolume: row.searchVolume,
				keywordDifficulty: row.keywordDifficulty,
				trafficEstimate: row.trafficEstimate,
				cpc: row.cpc,
				rankingUrl: row.rankingUrl,
				sourceProvider: SOURCE_PROVIDER,
				rawPayloadId: cmd.rawPayloadId,
				observedAt,
			}),
		);
		const { inserted } = await this.observations.saveAll(observations);
		return { ingested: inserted };
	}
}
