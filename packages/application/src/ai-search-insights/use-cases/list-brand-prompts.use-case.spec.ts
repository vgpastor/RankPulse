import { AiSearchInsights, type IdentityAccess, type ProjectManagement } from '@rankpulse/domain';
import type { Uuid } from '@rankpulse/shared';
import { InMemoryBrandPromptRepository } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ListBrandPromptsUseCase } from './list-brand-prompts.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const OTHER_PROJECT_ID = '22222222-2222-2222-2222-222222222222' as Uuid as ProjectManagement.ProjectId;

const buildPrompt = (
	id: string,
	text: string,
	projectId: ProjectManagement.ProjectId = PROJECT_ID,
): AiSearchInsights.BrandPrompt =>
	AiSearchInsights.BrandPrompt.register({
		id: id as Uuid as AiSearchInsights.BrandPromptId,
		organizationId: ORG_ID,
		projectId,
		text: AiSearchInsights.PromptText.create(text),
		kind: 'branded',
		now: new Date('2026-05-04T10:00:00Z'),
	});

describe('ListBrandPromptsUseCase', () => {
	let repo: InMemoryBrandPromptRepository;

	beforeEach(() => {
		repo = new InMemoryBrandPromptRepository();
	});

	it('returns an empty array when the project has no prompts', async () => {
		const useCase = new ListBrandPromptsUseCase(repo);
		const result = await useCase.execute({ projectId: PROJECT_ID });
		expect(result).toEqual([]);
	});

	it('lists every prompt registered against the project', async () => {
		await repo.save(buildPrompt('11111111-1111-1111-1111-aaaaaaaaaaa1', 'Best CRMs for solo founders?'));
		await repo.save(buildPrompt('11111111-1111-1111-1111-aaaaaaaaaaa2', 'Top SEO tools 2026'));
		const useCase = new ListBrandPromptsUseCase(repo);

		const result = await useCase.execute({ projectId: PROJECT_ID });

		expect(result).toHaveLength(2);
		expect(result.map((p) => p.text).sort()).toEqual(['Best CRMs for solo founders?', 'Top SEO tools 2026']);
	});

	it('scopes results to the requested project — other projects are excluded', async () => {
		await repo.save(buildPrompt('11111111-1111-1111-1111-aaaaaaaaaaa1', 'mine'));
		await repo.save(buildPrompt('11111111-1111-1111-1111-aaaaaaaaaaa2', 'theirs', OTHER_PROJECT_ID));
		const useCase = new ListBrandPromptsUseCase(repo);

		const result = await useCase.execute({ projectId: PROJECT_ID });

		expect(result).toHaveLength(1);
		expect(result[0]?.text).toBe('mine');
	});

	it('serialises pausedAt and createdAt as ISO strings (and null when active)', async () => {
		await repo.save(buildPrompt('11111111-1111-1111-1111-aaaaaaaaaaa1', 'an active prompt'));
		const useCase = new ListBrandPromptsUseCase(repo);

		const result = await useCase.execute({ projectId: PROJECT_ID });

		const dto = result[0];
		expect(dto?.createdAt).toBe(new Date('2026-05-04T10:00:00Z').toISOString());
		expect(dto?.pausedAt).toBeNull();
	});
});
