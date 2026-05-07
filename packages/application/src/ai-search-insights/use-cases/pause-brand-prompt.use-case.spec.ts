import { AiSearchInsights, type IdentityAccess, type ProjectManagement } from '@rankpulse/domain';
import { FakeClock, NotFoundError, type Uuid } from '@rankpulse/shared';
import { InMemoryBrandPromptRepository, RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PauseBrandPromptUseCase, ResumeBrandPromptUseCase } from './pause-brand-prompt.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const PROMPT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' as Uuid as AiSearchInsights.BrandPromptId;

const buildPrompt = (): AiSearchInsights.BrandPrompt =>
	AiSearchInsights.BrandPrompt.register({
		id: PROMPT_ID,
		organizationId: ORG_ID,
		projectId: PROJECT_ID,
		text: AiSearchInsights.PromptText.create('Best CRMs for solo founders?'),
		kind: 'branded',
		now: new Date('2026-05-04T10:00:00Z'),
	});

describe('PauseBrandPromptUseCase', () => {
	let repo: InMemoryBrandPromptRepository;
	let clock: FakeClock;
	let publisher: RecordingEventPublisher;
	let useCase: PauseBrandPromptUseCase;

	beforeEach(() => {
		repo = new InMemoryBrandPromptRepository();
		clock = new FakeClock('2026-05-05T12:00:00Z');
		publisher = new RecordingEventPublisher();
		useCase = new PauseBrandPromptUseCase(repo, clock, publisher);
	});

	it('pauses an active prompt and emits BrandPromptPaused', async () => {
		const prompt = buildPrompt();
		await repo.save(prompt);
		// Domain freshly-registered events are kept distinct from pause events;
		// pull and discard them so the spec asserts only on what THIS use case emits.
		prompt.pullEvents();

		const result = await useCase.execute({ brandPromptId: PROMPT_ID });

		expect(result.pausedAt).toBe(new Date('2026-05-05T12:00:00Z').toISOString());
		const persisted = await repo.findById(PROMPT_ID);
		expect(persisted?.pausedAt).toEqual(new Date('2026-05-05T12:00:00Z'));
		expect(publisher.publishedTypes()).toContain('BrandPromptPaused');
	});

	it('is a no-op (no save, no event) when the prompt is already paused', async () => {
		const prompt = buildPrompt();
		prompt.pause(new Date('2026-05-04T11:00:00Z'));
		prompt.pullEvents();
		await repo.save(prompt);

		const result = await useCase.execute({ brandPromptId: PROMPT_ID });

		expect(result.pausedAt).toBe(new Date('2026-05-04T11:00:00Z').toISOString());
		expect(publisher.published()).toHaveLength(0);
	});

	it('throws NotFoundError when the prompt does not exist', async () => {
		await expect(useCase.execute({ brandPromptId: 'missing' })).rejects.toBeInstanceOf(NotFoundError);
		expect(publisher.published()).toHaveLength(0);
	});
});

describe('ResumeBrandPromptUseCase', () => {
	let repo: InMemoryBrandPromptRepository;
	let clock: FakeClock;
	let publisher: RecordingEventPublisher;
	let useCase: ResumeBrandPromptUseCase;

	beforeEach(() => {
		repo = new InMemoryBrandPromptRepository();
		clock = new FakeClock('2026-05-05T12:00:00Z');
		publisher = new RecordingEventPublisher();
		useCase = new ResumeBrandPromptUseCase(repo, clock, publisher);
	});

	it('resumes a paused prompt and emits BrandPromptResumed', async () => {
		const prompt = buildPrompt();
		prompt.pause(new Date('2026-05-04T11:00:00Z'));
		prompt.pullEvents();
		await repo.save(prompt);

		const result = await useCase.execute({ brandPromptId: PROMPT_ID });

		expect(result.pausedAt).toBeNull();
		const persisted = await repo.findById(PROMPT_ID);
		expect(persisted?.pausedAt).toBeNull();
		expect(publisher.publishedTypes()).toContain('BrandPromptResumed');
	});

	it('is a no-op (no save, no event) when the prompt is already active', async () => {
		const prompt = buildPrompt();
		prompt.pullEvents();
		await repo.save(prompt);

		const result = await useCase.execute({ brandPromptId: PROMPT_ID });

		expect(result.pausedAt).toBeNull();
		expect(publisher.published()).toHaveLength(0);
	});

	it('throws NotFoundError when the prompt does not exist', async () => {
		await expect(useCase.execute({ brandPromptId: 'missing' })).rejects.toBeInstanceOf(NotFoundError);
	});
});
