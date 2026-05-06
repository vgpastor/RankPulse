import type { AiSearchInsights } from '@rankpulse/domain';
import { Uuid } from '@rankpulse/shared';
import { InMemoryBrandPromptRepository, RecordingEventPublisher } from '@rankpulse/testing';
import { describe, expect, it } from 'vitest';
import { RegisterBrandPromptUseCase } from './register-brand-prompt.use-case.js';

const fixedClock = (date: Date) => ({ now: () => date });
const fixedIds = (id: string) => ({ generate: () => id as ReturnType<typeof Uuid.generate> });

describe('RegisterBrandPromptUseCase', () => {
	it('persists the prompt and publishes BrandPromptCreated', async () => {
		const repo = new InMemoryBrandPromptRepository();
		const events = new RecordingEventPublisher();
		const useCase = new RegisterBrandPromptUseCase(
			repo,
			fixedClock(new Date('2026-05-06T10:00:00Z')),
			fixedIds('00000000-0000-0000-0000-000000000001'),
			events,
		);

		const projectId = Uuid.generate();
		const orgId = Uuid.generate();

		const result = await useCase.execute({
			organizationId: orgId,
			projectId,
			text: 'best CRM for B2B SaaS',
			kind: 'category',
		});

		expect(result.brandPromptId).toBe('00000000-0000-0000-0000-000000000001');
		const stored = await repo.findById(result.brandPromptId as AiSearchInsights.BrandPromptId);
		expect(stored?.text.value).toBe('best CRM for B2B SaaS');
		expect(stored?.kind).toBe('category');

		expect(events.publishedTypes()).toContain('BrandPromptCreated');
	});

	it('rejects a duplicate (project, text) tuple with a 409 conflict', async () => {
		const repo = new InMemoryBrandPromptRepository();
		const useCase = new RegisterBrandPromptUseCase(
			repo,
			fixedClock(new Date('2026-05-06T10:00:00Z')),
			fixedIds('00000000-0000-0000-0000-000000000002'),
			new RecordingEventPublisher(),
		);

		const projectId = Uuid.generate();
		const orgId = Uuid.generate();

		await useCase.execute({
			organizationId: orgId,
			projectId,
			text: 'best CRM for B2B SaaS',
			kind: 'category',
		});

		await expect(
			useCase.execute({
				organizationId: orgId,
				projectId,
				text: 'best CRM for B2B SaaS',
				kind: 'category',
			}),
		).rejects.toThrow(/already exists/);
	});
});
