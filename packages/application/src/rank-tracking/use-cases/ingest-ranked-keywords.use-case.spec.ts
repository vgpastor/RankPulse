import type { IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { FixedIdGenerator, type Uuid } from '@rankpulse/shared';
import {
	aProject,
	InMemoryProjectRepository,
	InMemoryRankedKeywordObservationRepository,
} from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { IngestRankedKeywordsUseCase } from './ingest-ranked-keywords.use-case.js';

const orgId = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;

describe('IngestRankedKeywordsUseCase', () => {
	let projects: InMemoryProjectRepository;
	let observations: InMemoryRankedKeywordObservationRepository;
	let project: ProjectManagement.Project;
	let useCase: IngestRankedKeywordsUseCase;

	const ids = (n: number): FixedIdGenerator =>
		new FixedIdGenerator(
			Array.from({ length: n }, (_, i) => `dddddddd-dddd-dddd-dddd-${String(i).padStart(12, '0')}` as Uuid),
		);

	beforeEach(async () => {
		projects = new InMemoryProjectRepository();
		observations = new InMemoryRankedKeywordObservationRepository();
		project = aProject({ organizationId: orgId });
		await projects.save(project);
		useCase = new IngestRankedKeywordsUseCase(projects, observations, ids(50));
	});

	it('persists each row with the batch-level country/language/targetDomain', async () => {
		const result = await useCase.execute({
			projectId: project.id,
			targetDomain: 'controlrondas.com',
			country: 'ES',
			language: 'es',
			rawPayloadId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			observedAt: new Date('2026-05-09T06:00:00Z'),
			rows: [
				{
					keyword: 'control de rondas',
					position: 5,
					rankingUrl: 'https://controlrondas.com/precios',
					searchVolume: 720,
					keywordDifficulty: 22,
					trafficEstimate: 12.3,
					cpc: 1.4,
				},
				{
					keyword: 'app vigilantes',
					position: 12,
					rankingUrl: 'https://controlrondas.com/',
					searchVolume: 90,
					keywordDifficulty: null,
					trafficEstimate: null,
					cpc: null,
				},
			],
		});
		expect(result.ingested).toBe(2);
		expect(observations.rows).toHaveLength(2);
		expect(observations.rows[0]?.targetDomain).toBe('controlrondas.com');
		expect(observations.rows[0]?.country).toBe('ES');
		expect(observations.rows[0]?.sourceProvider).toBe('dataforseo');
		expect(observations.rows[1]?.position).toBe(12);
	});

	it('returns 0 and does not call repos when rows is empty', async () => {
		const result = await useCase.execute({
			projectId: project.id,
			targetDomain: 'controlrondas.com',
			country: 'ES',
			language: 'es',
			rawPayloadId: null,
			rows: [],
		});
		expect(result.ingested).toBe(0);
		expect(observations.rows).toHaveLength(0);
	});

	it('throws NotFoundError when the project does not exist', async () => {
		await expect(
			useCase.execute({
				projectId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
				targetDomain: 'controlrondas.com',
				country: 'ES',
				language: 'es',
				rawPayloadId: null,
				rows: [
					{
						keyword: 'x',
						position: 1,
						rankingUrl: null,
						searchVolume: 0,
						keywordDifficulty: 0,
						trafficEstimate: 0,
						cpc: 0,
					},
				],
			}),
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});
