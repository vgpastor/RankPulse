import type { IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { FixedIdGenerator, type Uuid } from '@rankpulse/shared';
import {
	aProject,
	InMemoryCompetitorKeywordGapRepository,
	InMemoryProjectRepository,
} from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { IngestDomainIntersectionUseCase } from './ingest-domain-intersection.use-case.js';

const orgId = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;

describe('IngestDomainIntersectionUseCase', () => {
	let projects: InMemoryProjectRepository;
	let gaps: InMemoryCompetitorKeywordGapRepository;
	let project: ProjectManagement.Project;
	let useCase: IngestDomainIntersectionUseCase;

	const ids = (n: number): FixedIdGenerator =>
		new FixedIdGenerator(
			Array.from({ length: n }, (_, i) => `dddddddd-dddd-dddd-dddd-${String(i).padStart(12, '0')}` as Uuid),
		);

	beforeEach(async () => {
		projects = new InMemoryProjectRepository();
		gaps = new InMemoryCompetitorKeywordGapRepository();
		project = aProject({ organizationId: orgId });
		await projects.save(project);
		useCase = new IngestDomainIntersectionUseCase(projects, gaps, ids(50));
	});

	it('persists each row stamped with batch-level ourDomain/competitorDomain/locale', async () => {
		const result = await useCase.execute({
			projectId: project.id,
			ourDomain: 'controlrondas.com',
			competitorDomain: 'rondacontrol.es',
			country: 'ES',
			language: 'es',
			rawPayloadId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			observedAt: new Date('2026-05-09T06:00:00Z'),
			rows: [
				{
					keyword: 'control de rondas',
					ourPosition: null,
					theirPosition: 4,
					searchVolume: 720,
					cpc: 1.4,
					keywordDifficulty: 22,
				},
				{
					keyword: 'app vigilantes',
					ourPosition: 35,
					theirPosition: 8,
					searchVolume: 90,
					cpc: null,
					keywordDifficulty: null,
				},
			],
		});
		expect(result.ingested).toBe(2);
		expect(gaps.rows).toHaveLength(2);
		expect(gaps.rows[0]?.ourDomain).toBe('controlrondas.com');
		expect(gaps.rows[0]?.competitorDomain).toBe('rondacontrol.es');
		expect(gaps.rows[0]?.sourceProvider).toBe('dataforseo');
		expect(gaps.rows[1]?.ourPosition).toBe(35);
		expect(gaps.rows[1]?.theirPosition).toBe(8);
	});

	it('returns 0 and does not call repos when rows is empty', async () => {
		const result = await useCase.execute({
			projectId: project.id,
			ourDomain: 'controlrondas.com',
			competitorDomain: 'rondacontrol.es',
			country: 'ES',
			language: 'es',
			rawPayloadId: null,
			rows: [],
		});
		expect(result.ingested).toBe(0);
		expect(gaps.rows).toHaveLength(0);
	});

	it('throws NotFoundError when the project does not exist', async () => {
		await expect(
			useCase.execute({
				projectId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
				ourDomain: 'controlrondas.com',
				competitorDomain: 'rondacontrol.es',
				country: 'ES',
				language: 'es',
				rawPayloadId: null,
				rows: [
					{
						keyword: 'x',
						ourPosition: null,
						theirPosition: 1,
						searchVolume: 0,
						cpc: 0,
						keywordDifficulty: 0,
					},
				],
			}),
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});
