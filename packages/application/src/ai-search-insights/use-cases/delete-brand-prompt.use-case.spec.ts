import { AiSearchInsights, type IdentityAccess, type ProjectManagement } from '@rankpulse/domain';
import { NotFoundError, type Uuid } from '@rankpulse/shared';
import { InMemoryBrandPromptRepository } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { DeleteBrandPromptUseCase } from './delete-brand-prompt.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;

const buildPrompt = (id: string, text: string) =>
	AiSearchInsights.BrandPrompt.register({
		id: id as Uuid as AiSearchInsights.BrandPromptId,
		organizationId: ORG_ID,
		projectId: PROJECT_ID,
		text: AiSearchInsights.PromptText.create(text),
		kind: 'branded',
		now: new Date('2026-05-04T10:00:00Z'),
	});

describe('DeleteBrandPromptUseCase', () => {
	let repo: InMemoryBrandPromptRepository;

	beforeEach(() => {
		repo = new InMemoryBrandPromptRepository();
	});

	it('removes the prompt from the repository', async () => {
		const prompt = buildPrompt('bp-1', 'Best CRMs for solo founders?');
		await repo.save(prompt);

		const useCase = new DeleteBrandPromptUseCase(repo);
		await useCase.execute({ brandPromptId: prompt.id });

		expect(await repo.findById(prompt.id)).toBeNull();
	});

	it('throws NotFoundError when the prompt does not exist', async () => {
		const useCase = new DeleteBrandPromptUseCase(repo);
		await expect(useCase.execute({ brandPromptId: 'missing' })).rejects.toBeInstanceOf(NotFoundError);
	});

	it('only deletes the targeted prompt when several exist for the same project', async () => {
		const first = buildPrompt('bp-1', 'Best CRMs for solo founders?');
		const second = buildPrompt('bp-2', 'Top SEO tools 2026');
		await repo.save(first);
		await repo.save(second);

		const useCase = new DeleteBrandPromptUseCase(repo);
		await useCase.execute({ brandPromptId: first.id });

		expect(await repo.findById(first.id)).toBeNull();
		expect(await repo.findById(second.id)).not.toBeNull();
	});

	it('rejects a re-delete on the same id with NotFoundError (already removed)', async () => {
		const prompt = buildPrompt('bp-1', 'Best CRMs for solo founders?');
		await repo.save(prompt);

		const useCase = new DeleteBrandPromptUseCase(repo);
		await useCase.execute({ brandPromptId: prompt.id });

		await expect(useCase.execute({ brandPromptId: prompt.id })).rejects.toBeInstanceOf(NotFoundError);
	});
});
