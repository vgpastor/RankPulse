import { type IdentityAccess, ProjectManagement, type RankTracking } from '@rankpulse/domain';
import { NotFoundError, type Uuid } from '@rankpulse/shared';
import { InMemoryCompetitorRepository, InMemoryProjectRepository } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { QuerySerpCompetitorSuggestionsUseCase } from './query-serp-competitor-suggestions.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const COMP_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd' as Uuid as ProjectManagement.CompetitorId;

class FakeSerpObsRepo implements RankTracking.SerpObservationRepository {
	requested: { projectId: string; min: number; exclude: readonly string[] } | null = null;
	suggestions: RankTracking.CompetitorSuggestionRow[] = [];
	async save(): Promise<void> {}
	async listLatestForProject(): Promise<readonly RankTracking.SerpObservation[]> {
		return [];
	}
	async listCompetitorSuggestions(
		projectId: ProjectManagement.ProjectId,
		_windowDays: number,
		minDistinctKeywords: number,
		excludeDomains: readonly string[],
	): Promise<readonly RankTracking.CompetitorSuggestionRow[]> {
		this.requested = { projectId, min: minDistinctKeywords, exclude: excludeDomains };
		return this.suggestions;
	}
}

describe('QuerySerpCompetitorSuggestionsUseCase', () => {
	let projects: InMemoryProjectRepository;
	let competitors: InMemoryCompetitorRepository;
	let serp: FakeSerpObsRepo;
	let useCase: QuerySerpCompetitorSuggestionsUseCase;

	beforeEach(async () => {
		projects = new InMemoryProjectRepository();
		competitors = new InMemoryCompetitorRepository();
		serp = new FakeSerpObsRepo();
		useCase = new QuerySerpCompetitorSuggestionsUseCase(projects, competitors, serp);
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

	it('passes own + competitor domains as exclusion list to the repo', async () => {
		await competitors.save(
			ProjectManagement.Competitor.add({
				id: COMP_ID,
				projectId: PROJECT_ID,
				domain: ProjectManagement.DomainName.create('silvertrac.com'),
				now: new Date('2026-05-01T10:00:00Z'),
			}),
		);

		await useCase.execute({ projectId: PROJECT_ID });

		expect(serp.requested?.exclude).toEqual(expect.arrayContaining(['controlrondas.com', 'silvertrac.com']));
	});

	it('defaults minDistinctKeywords to 2', async () => {
		await useCase.execute({ projectId: PROJECT_ID });
		expect(serp.requested?.min).toBe(2);
	});

	it('honours custom minDistinctKeywords', async () => {
		await useCase.execute({ projectId: PROJECT_ID, minDistinctKeywords: 5 });
		expect(serp.requested?.min).toBe(5);
	});

	it('clamps minDistinctKeywords to ≥1', async () => {
		await useCase.execute({ projectId: PROJECT_ID, minDistinctKeywords: 0 });
		expect(serp.requested?.min).toBe(1);
	});

	it('returns the rows from the repository unchanged', async () => {
		serp.suggestions = [
			{
				domain: 'wikipedia.org',
				distinctKeywords: 3,
				totalAppearances: 9,
				bestRank: 4,
				sampleUrl: 'https://wikipedia.org/x',
			},
		];
		const result = await useCase.execute({ projectId: PROJECT_ID });
		expect(result.suggestions).toHaveLength(1);
		expect(result.suggestions[0]?.domain).toBe('wikipedia.org');
	});

	it('throws NotFoundError when the project does not exist', async () => {
		await expect(
			useCase.execute({ projectId: '99999999-9999-9999-9999-999999999999' }),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});
