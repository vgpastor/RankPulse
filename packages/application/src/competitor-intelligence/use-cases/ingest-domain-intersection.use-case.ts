import { CompetitorIntelligence, type ProjectManagement } from '@rankpulse/domain';
import { type IdGenerator, NotFoundError } from '@rankpulse/shared';

export interface DomainIntersectionRow {
	keyword: string;
	ourPosition: number | null;
	theirPosition: number | null;
	searchVolume: number | null;
	cpc: number | null;
	keywordDifficulty: number | null;
}

export interface IngestDomainIntersectionCommand {
	projectId: string;
	ourDomain: string;
	competitorDomain: string;
	country: string;
	language: string;
	rows: readonly DomainIntersectionRow[];
	rawPayloadId: string | null;
	observedAt?: Date;
}

export interface IngestDomainIntersectionResult {
	ingested: number;
}

const SOURCE_PROVIDER = 'dataforseo';

/**
 * Issue #128: persists a snapshot of competitor keyword gaps — keywords where
 * the competitor ranks (top-100) and our domain either does not, or ranks
 * worse — into `competitor_keyword_gaps`. Mirrors the passive-observation
 * ingest pattern of `IngestRankedKeywordsUseCase` (#127): no domain events,
 * the natural-key PK absorbs idempotent re-runs.
 */
export class IngestDomainIntersectionUseCase {
	constructor(
		private readonly projects: ProjectManagement.ProjectRepository,
		private readonly gaps: CompetitorIntelligence.CompetitorKeywordGapRepository,
		private readonly ids: IdGenerator,
	) {}

	async execute(cmd: IngestDomainIntersectionCommand): Promise<IngestDomainIntersectionResult> {
		if (cmd.rows.length === 0) {
			return { ingested: 0 };
		}
		const project = await this.projects.findById(cmd.projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${cmd.projectId} not found`);
		}
		const observedAt = cmd.observedAt ?? new Date();
		const gaps = cmd.rows.map((row) =>
			CompetitorIntelligence.CompetitorKeywordGap.record({
				id: this.ids.generate() as CompetitorIntelligence.CompetitorKeywordGapId,
				projectId: project.id,
				ourDomain: cmd.ourDomain,
				competitorDomain: cmd.competitorDomain,
				keyword: row.keyword,
				country: cmd.country,
				language: cmd.language,
				ourPosition: row.ourPosition,
				theirPosition: row.theirPosition,
				searchVolume: row.searchVolume,
				cpc: row.cpc,
				keywordDifficulty: row.keywordDifficulty,
				sourceProvider: SOURCE_PROVIDER,
				rawPayloadId: cmd.rawPayloadId,
				observedAt,
			}),
		);
		const { inserted } = await this.gaps.saveAll(gaps);
		return { ingested: inserted };
	}
}
