import { type IdentityAccess, ProjectManagement, RankTracking } from '@rankpulse/domain';
import { NotFoundError, type Uuid } from '@rankpulse/shared';
import { InMemoryCompetitorRepository, InMemoryProjectRepository } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { QuerySerpMapUseCase } from './query-serp-map.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const OBS_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' as Uuid as RankTracking.SerpObservationId;
const COMP_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd' as Uuid as ProjectManagement.CompetitorId;

class InMemorySerpObsRepo implements RankTracking.SerpObservationRepository {
	rows: RankTracking.SerpObservation[] = [];
	async save(obs: RankTracking.SerpObservation): Promise<void> {
		this.rows.push(obs);
	}
	async listLatestForProject(
		projectId: ProjectManagement.ProjectId,
	): Promise<readonly RankTracking.SerpObservation[]> {
		return this.rows.filter((r) => r.projectId === projectId);
	}
	async listCompetitorSuggestions(): Promise<readonly RankTracking.CompetitorSuggestionRow[]> {
		return [];
	}
}

const buildObservation = (
	results: { rank: number; domain: string; url: string | null; title: string | null }[],
): RankTracking.SerpObservation =>
	RankTracking.SerpObservation.record({
		id: OBS_ID,
		projectId: PROJECT_ID,
		phrase: 'control de rondas',
		country: 'ES',
		language: 'es',
		device: RankTracking.Devices.DESKTOP,
		results: results.map((r) => RankTracking.SerpResult.create(r)),
		sourceProvider: 'dataforseo',
		rawPayloadId: null,
		now: new Date('2026-05-09T10:00:00Z'),
	});

describe('QuerySerpMapUseCase', () => {
	let projects: InMemoryProjectRepository;
	let competitors: InMemoryCompetitorRepository;
	let serp: InMemorySerpObsRepo;
	let useCase: QuerySerpMapUseCase;

	beforeEach(async () => {
		projects = new InMemoryProjectRepository();
		competitors = new InMemoryCompetitorRepository();
		serp = new InMemorySerpObsRepo();
		useCase = new QuerySerpMapUseCase(projects, competitors, serp);
		await projects.save(
			ProjectManagement.Project.create({
				id: PROJECT_ID,
				organizationId: ORG_ID,
				portfolioId: null,
				name: 'PatrolTech',
				primaryDomain: ProjectManagement.DomainName.create('controlrondas.com'),
				now: new Date('2026-04-01T10:00:00Z'),
			}),
		);
	});

	it('classifies own / competitor / other domains', async () => {
		await competitors.save(
			ProjectManagement.Competitor.add({
				id: COMP_ID,
				projectId: PROJECT_ID,
				domain: ProjectManagement.DomainName.create('silvertrac.com'),
				label: 'Silvertrac',
				now: new Date('2026-05-01T10:00:00Z'),
			}),
		);
		await serp.save(
			buildObservation([
				{ rank: 1, domain: 'silvertrac.com', url: 'https://silvertrac.com/a', title: 'A' },
				{ rank: 2, domain: 'controlrondas.com', url: 'https://controlrondas.com/b', title: 'B' },
				{ rank: 3, domain: 'wikipedia.org', url: 'https://wikipedia.org/c', title: 'C' },
			]),
		);

		const result = await useCase.execute({ projectId: PROJECT_ID });

		expect(result.rows).toHaveLength(1);
		const row = result.rows[0];
		expect(row?.results.map((r) => r.classification)).toEqual(['competitor', 'own', 'other']);
		expect(row?.results[0]?.competitorLabel).toBe('Silvertrac');
		expect(row?.results[1]?.competitorLabel).toBeNull();
	});

	it('throws NotFoundError when the project does not exist', async () => {
		await expect(
			useCase.execute({ projectId: '99999999-9999-9999-9999-999999999999' }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('returns empty rows when no SERP snapshot is stored', async () => {
		const result = await useCase.execute({ projectId: PROJECT_ID });
		expect(result.rows).toHaveLength(0);
	});

	it('serialises observedAt as ISO string', async () => {
		await serp.save(buildObservation([{ rank: 1, domain: 'silvertrac.com', url: null, title: null }]));
		const result = await useCase.execute({ projectId: PROJECT_ID });
		expect(result.rows[0]?.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
	});
});
