import type { ProjectManagement, RankTracking } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface QuerySerpMapCommand {
	projectId: string;
	phrase?: string;
	country?: string;
	language?: string;
	windowDays?: number;
}

export type SerpResultClassification = 'own' | 'competitor' | 'other';

export interface SerpMapResultDto {
	rank: number;
	domain: string;
	url: string | null;
	title: string | null;
	classification: SerpResultClassification;
	competitorLabel: string | null;
}

export interface SerpMapRowDto {
	phrase: string;
	country: string;
	language: string;
	device: 'desktop' | 'mobile';
	observedAt: string;
	results: SerpMapResultDto[];
}

export interface SerpMapResponse {
	rows: SerpMapRowDto[];
}

const DEFAULT_WINDOW_DAYS = 7;

const normalizeDomain = (raw: string): string =>
	raw
		.trim()
		.toLowerCase()
		.replace(/^www\./, '');

/**
 * Returns the latest top-N SERP per (phrase, locale, device) for a project,
 * with each row classified as own / competitor / other by cross-referencing
 * the project's tracked domains and registered competitors. Used by the
 * SERP-Map UI tab on the Rankings page.
 *
 * The classification is computed at query time (not at ingest time) on
 * purpose: registering a new competitor or adding a project domain should
 * reclassify existing snapshots immediately, without re-ingesting the
 * underlying raw_payloads.
 */
export class QuerySerpMapUseCase {
	constructor(
		private readonly projects: ProjectManagement.ProjectRepository,
		private readonly competitors: ProjectManagement.CompetitorRepository,
		private readonly serpObservations: RankTracking.SerpObservationRepository,
	) {}

	async execute(cmd: QuerySerpMapCommand): Promise<SerpMapResponse> {
		const projectId = cmd.projectId as ProjectManagement.ProjectId;
		const project = await this.projects.findById(projectId);
		if (!project) {
			throw new NotFoundError(`Project ${cmd.projectId} not found`);
		}
		const competitors = await this.competitors.listForProject(projectId);
		const ownDomains = new Set(project.domains.map((d) => normalizeDomain(d.domain.value)));
		const competitorByDomain = new Map<string, string>();
		for (const c of competitors) {
			competitorByDomain.set(normalizeDomain(c.domain.value), c.label);
		}

		const observations = await this.serpObservations.listLatestForProject(
			projectId,
			cmd.windowDays ?? DEFAULT_WINDOW_DAYS,
			{
				phrase: cmd.phrase,
				country: cmd.country,
				language: cmd.language,
			},
		);

		const rows: SerpMapRowDto[] = observations.map((obs) => ({
			phrase: obs.phrase,
			country: obs.country,
			language: obs.language,
			device: obs.device,
			observedAt: obs.observedAt.toISOString(),
			results: obs.results.map((r) => {
				const competitorLabel = competitorByDomain.get(r.domain) ?? null;
				const classification: SerpResultClassification = ownDomains.has(r.domain)
					? 'own'
					: competitorLabel
						? 'competitor'
						: 'other';
				return {
					rank: r.rank,
					domain: r.domain,
					url: r.url,
					title: r.title,
					classification,
					competitorLabel,
				};
			}),
		}));
		return { rows };
	}
}
