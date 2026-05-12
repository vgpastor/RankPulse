import type { IdentityAccess } from '@rankpulse/domain';
import { ProjectManagement } from '@rankpulse/domain';
import { NotFoundError, type Uuid } from '@rankpulse/shared';
import { InMemoryCompetitorRepository, InMemoryProjectRepository } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { RemoveCompetitorUseCase } from './remove-competitor.use-case.js';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const COMP_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid as ProjectManagement.CompetitorId;

describe('RemoveCompetitorUseCase', () => {
	let projects: InMemoryProjectRepository;
	let competitors: InMemoryCompetitorRepository;
	let useCase: RemoveCompetitorUseCase;

	beforeEach(async () => {
		projects = new InMemoryProjectRepository();
		competitors = new InMemoryCompetitorRepository();
		useCase = new RemoveCompetitorUseCase(projects, competitors);
		const project = ProjectManagement.Project.create({
			id: PROJECT_ID,
			organizationId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' as Uuid as IdentityAccess.OrganizationId,
			portfolioId: null,
			name: 'Test',
			primaryDomain: ProjectManagement.DomainName.create('example.com'),
			now: new Date('2026-05-10'),
		});
		await projects.save(project);
		const competitor = ProjectManagement.Competitor.add({
			id: COMP_ID,
			projectId: PROJECT_ID,
			domain: ProjectManagement.DomainName.create('rival.com'),
			now: new Date('2026-05-10'),
		});
		await competitors.save(competitor);
	});

	it('removes the competitor when (project, competitor) matches', async () => {
		const res = await useCase.execute({ projectId: PROJECT_ID, competitorId: COMP_ID });
		expect(res.removed).toBe(true);
		expect(await competitors.findById(COMP_ID)).toBeNull();
	});

	it('throws NotFoundError when project does not exist', async () => {
		await expect(
			useCase.execute({ projectId: '00000000-0000-0000-0000-000000000000', competitorId: COMP_ID }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('throws NotFoundError when competitor belongs to a different project', async () => {
		const otherCompId = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as ProjectManagement.CompetitorId;
		await expect(
			useCase.execute({ projectId: PROJECT_ID, competitorId: otherCompId }),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});
