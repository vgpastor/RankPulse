import type { ProjectManagement } from '@rankpulse/domain';
import { FakeClock, FixedIdGenerator, NotFoundError, Uuid } from '@rankpulse/shared';
import {
	aProject,
	InMemoryKeywordListRepository,
	InMemoryProjectRepository,
	RecordingEventPublisher,
} from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ImportKeywordsUseCase } from './import-keywords.use-case.js';

describe('ImportKeywordsUseCase', () => {
	let projects: InMemoryProjectRepository;
	let lists: InMemoryKeywordListRepository;
	let clock: FakeClock;
	let events: RecordingEventPublisher;
	let project: ProjectManagement.Project;

	beforeEach(async () => {
		projects = new InMemoryProjectRepository();
		lists = new InMemoryKeywordListRepository();
		clock = new FakeClock('2026-05-04T10:00:00Z');
		events = new RecordingEventPublisher();

		project = aProject();
		await projects.save(project);
	});

	it('creates a new keyword list when no listId is provided and emits KeywordsAdded', async () => {
		const listId = Uuid.generate();
		const k1 = Uuid.generate();
		const k2 = Uuid.generate();
		const ids = new FixedIdGenerator([listId, k1, k2]);
		const useCase = new ImportKeywordsUseCase(projects, lists, clock, ids, events);

		const result = await useCase.execute({
			projectId: project.id,
			listName: 'Spain core',
			phrases: [{ phrase: 'control de rondas' }, { phrase: 'app control de rondas' }],
		});

		expect(result.added).toBe(2);
		expect(result.keywordListId).toBe(listId);
		const stored = await lists.findById(listId as ProjectManagement.KeywordListId);
		expect(stored?.keywords).toHaveLength(2);
		expect(events.publishedTypes()).toContain('project-management.KeywordsAdded');
	});

	it('rejects when the project does not exist', async () => {
		const ids = new FixedIdGenerator([Uuid.generate(), Uuid.generate()]);
		const useCase = new ImportKeywordsUseCase(projects, lists, clock, ids, events);
		await expect(
			useCase.execute({ projectId: Uuid.generate(), phrases: [{ phrase: 'k' }] }),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});
