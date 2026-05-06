import { type ProjectManagement, ProviderConnectivity } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';
import { describe, expect, it, vi } from 'vitest';
import {
	DeleteJobDefinitionUseCase,
	GetJobDefinitionUseCase,
	ListJobDefinitionsUseCase,
	UpdateJobDefinitionUseCase,
} from './manage-job-definition.use-cases.js';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as ProjectManagement.ProjectId;
const OTHER_PROJECT_ID = 'aaaaaaaa-1111-1111-1111-111111111111' as ProjectManagement.ProjectId;

class StubDefinitionRepo implements ProviderConnectivity.JobDefinitionRepository {
	readonly store = new Map<string, ProviderConnectivity.ProviderJobDefinition>();
	put(def: ProviderConnectivity.ProviderJobDefinition): void {
		this.store.set(def.id, def);
	}
	async save(d: ProviderConnectivity.ProviderJobDefinition): Promise<void> {
		this.store.set(d.id, d);
	}
	async findById(id: ProviderConnectivity.ProviderJobDefinitionId) {
		return this.store.get(id) ?? null;
	}
	async findFor() {
		return null;
	}
	async findByProjectEndpointAndSystemParam(): Promise<ProviderConnectivity.ProviderJobDefinition | null> {
		return null;
	}
	async listForProject(projectId: ProjectManagement.ProjectId) {
		return [...this.store.values()].filter((d) => d.projectId === projectId);
	}
	async delete(id: ProviderConnectivity.ProviderJobDefinitionId) {
		this.store.delete(id);
	}
}

class RecordingScheduler implements ProviderConnectivity.JobScheduler {
	readonly registered: ProviderConnectivity.ProviderJobDefinition[] = [];
	readonly unregistered: ProviderConnectivity.ProviderJobDefinition[] = [];
	async register(d: ProviderConnectivity.ProviderJobDefinition): Promise<void> {
		this.registered.push(d);
	}
	async unregister(d: ProviderConnectivity.ProviderJobDefinition): Promise<void> {
		this.unregistered.push(d);
	}
	async enqueueOnce(): Promise<void> {}
}

const buildDef = (overrides: Partial<{ id: string; projectId: ProjectManagement.ProjectId }> = {}) =>
	ProviderConnectivity.ProviderJobDefinition.schedule({
		id: (overrides.id ?? 'def-1') as ProviderConnectivity.ProviderJobDefinitionId,
		projectId: overrides.projectId ?? PROJECT_ID,
		providerId: ProviderConnectivity.ProviderId.create('dataforseo'),
		endpointId: ProviderConnectivity.EndpointId.create('serp-google-organic-live'),
		params: { keyword: 'k', locationCode: 2724, languageCode: 'es', device: 'desktop' },
		cron: ProviderConnectivity.CronExpression.create('0 6 * * 1'),
		credentialOverrideId: null,
		now: new Date('2026-05-04T00:00:00Z'),
	});

describe('ListJobDefinitionsUseCase', () => {
	it('returns all definitions for the requested project, formatted as JobDefinitionView', async () => {
		const repo = new StubDefinitionRepo();
		repo.put(buildDef({ id: 'def-1' }));
		repo.put(buildDef({ id: 'def-2' }));
		repo.put(buildDef({ id: 'def-other', projectId: OTHER_PROJECT_ID }));

		const result = await new ListJobDefinitionsUseCase(repo).execute(PROJECT_ID);

		expect(result.map((v) => v.id).sort()).toEqual(['def-1', 'def-2']);
		expect(result[0]?.cron).toBe('0 6 * * 1');
		expect(result[0]?.enabled).toBe(true);
		expect(result[0]?.lastRunAt).toBeNull();
		expect(typeof result[0]?.createdAt).toBe('string');
	});

	it('returns an empty array when no definitions match', async () => {
		const result = await new ListJobDefinitionsUseCase(new StubDefinitionRepo()).execute(PROJECT_ID);
		expect(result).toEqual([]);
	});
});

describe('GetJobDefinitionUseCase', () => {
	it('returns the formatted view when the definition exists', async () => {
		const repo = new StubDefinitionRepo();
		repo.put(buildDef({ id: 'def-1' }));

		const view = await new GetJobDefinitionUseCase(repo).execute('def-1');

		expect(view.id).toBe('def-1');
		expect(view.providerId).toBe('dataforseo');
		expect(view.endpointId).toBe('serp-google-organic-live');
	});

	it('throws NotFoundError when the definition does not exist', async () => {
		await expect(
			new GetJobDefinitionUseCase(new StubDefinitionRepo()).execute('missing'),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});

describe('UpdateJobDefinitionUseCase', () => {
	it('updates cron and re-registers the repeatable in the scheduler', async () => {
		const repo = new StubDefinitionRepo();
		const scheduler = new RecordingScheduler();
		repo.put(buildDef({ id: 'def-1' }));

		const view = await new UpdateJobDefinitionUseCase(repo, scheduler).execute({
			definitionId: 'def-1',
			cron: '0 12 * * *',
		});

		expect(view.cron).toBe('0 12 * * *');
		expect(scheduler.unregistered).toHaveLength(1);
		expect(scheduler.registered).toHaveLength(1);
		// unregister BEFORE register so BullMQ removes the OLD repeatable hash.
		expect(scheduler.registered[0]?.cron.value).toBe('0 12 * * *');
	});

	it('updates params after merging into the existing definition', async () => {
		const repo = new StubDefinitionRepo();
		repo.put(buildDef({ id: 'def-1' }));

		const view = await new UpdateJobDefinitionUseCase(repo, new RecordingScheduler()).execute({
			definitionId: 'def-1',
			params: { keyword: 'new', locationCode: 2840, languageCode: 'en', device: 'mobile' },
		});

		expect(view.params).toMatchObject({ keyword: 'new', device: 'mobile' });
	});

	it('disables the definition when enabled=false (and unregisters from scheduler)', async () => {
		const repo = new StubDefinitionRepo();
		const scheduler = new RecordingScheduler();
		repo.put(buildDef({ id: 'def-1' }));

		const view = await new UpdateJobDefinitionUseCase(repo, scheduler).execute({
			definitionId: 'def-1',
			enabled: false,
		});

		expect(view.enabled).toBe(false);
		// register() is still called; the BullMqJobScheduler honours `enabled=false`
		// internally by skipping the repeatable add. We just assert the call shape.
		expect(scheduler.registered[0]?.enabled).toBe(false);
	});

	it('throws NotFoundError when the definition does not exist', async () => {
		const useCase = new UpdateJobDefinitionUseCase(new StubDefinitionRepo(), new RecordingScheduler());
		await expect(useCase.execute({ definitionId: 'missing', cron: '* * * * *' })).rejects.toBeInstanceOf(
			NotFoundError,
		);
	});
});

describe('DeleteJobDefinitionUseCase', () => {
	it('unregisters from the scheduler then removes the row', async () => {
		const repo = new StubDefinitionRepo();
		const scheduler = new RecordingScheduler();
		repo.put(buildDef({ id: 'def-1' }));

		await new DeleteJobDefinitionUseCase(repo, scheduler).execute('def-1');

		expect(scheduler.unregistered).toHaveLength(1);
		expect(repo.store.has('def-1')).toBe(false);
	});

	it('throws NotFoundError when the definition does not exist', async () => {
		const useCase = new DeleteJobDefinitionUseCase(new StubDefinitionRepo(), new RecordingScheduler());
		await expect(useCase.execute('missing')).rejects.toBeInstanceOf(NotFoundError);
	});
});

// ===== BACKLOG bug #51: PATCH preserves systemParams =====
import { ProviderConnectivity as PC2 } from '@rankpulse/domain';
import { UpdateJobDefinitionUseCase as UpdateJobDefUC2 } from './manage-job-definition.use-cases.js';

describe('UpdateJobDefinitionUseCase — preserves systemParams (bug #51)', () => {
	const aDefinitionWithSystemParams = (): PC2.ProviderJobDefinition =>
		PC2.ProviderJobDefinition.schedule({
			id: 'def-aabbcc' as PC2.ProviderJobDefinitionId,
			projectId: 'proj-1' as never,
			providerId: PC2.ProviderId.create('google-search-console'),
			endpointId: PC2.EndpointId.create('gsc-search-analytics'),
			params: {
				siteUrl: 'sc-domain:example.com',
				startDate: '{{today-30}}',
				endDate: '{{today-2}}',
				dimensions: ['date', 'query', 'page'],
				rowLimit: 25000,
				// systemParams mixed in (current model)
				organizationId: 'org-1',
				gscPropertyId: 'prop-1',
			},
			cron: PC2.CronExpression.create('0 5 * * *'),
			credentialOverrideId: null,
			now: new Date('2026-05-05T00:00:00Z'),
		});

	it('preserves organizationId and gscPropertyId when caller PATCHes only user keys', async () => {
		const def = aDefinitionWithSystemParams();
		const repo = {
			save: vi.fn(),
			findById: vi.fn().mockResolvedValue(def),
			deactivate: vi.fn(),
			delete: vi.fn(),
			listForProject: vi.fn(),
		} as unknown as PC2.JobDefinitionRepository;
		const scheduler = {
			register: vi.fn(),
			unregister: vi.fn(),
			enqueueOnce: vi.fn(),
		} satisfies PC2.JobScheduler;

		const uc = new UpdateJobDefUC2(repo, scheduler);
		const view = await uc.execute({
			definitionId: 'def-aabbcc',
			params: {
				siteUrl: 'sc-domain:example.com',
				startDate: '2025-05-06',
				endDate: '{{today-2}}',
				dimensions: ['date', 'query', 'page'],
				rowLimit: 25000,
			},
		});

		expect(view.params.organizationId).toBe('org-1');
		expect(view.params.gscPropertyId).toBe('prop-1');
		expect(view.params.startDate).toBe('2025-05-06');
	});

	it('user PATCH cannot overwrite systemParams (defensive)', async () => {
		const def = aDefinitionWithSystemParams();
		const repo = {
			save: vi.fn(),
			findById: vi.fn().mockResolvedValue(def),
			deactivate: vi.fn(),
			delete: vi.fn(),
			listForProject: vi.fn(),
		} as unknown as PC2.JobDefinitionRepository;
		const scheduler = {
			register: vi.fn(),
			unregister: vi.fn(),
			enqueueOnce: vi.fn(),
		} satisfies PC2.JobScheduler;

		const uc = new UpdateJobDefUC2(repo, scheduler);
		const view = await uc.execute({
			definitionId: 'def-aabbcc',
			params: {
				siteUrl: 'sc-domain:example.com',
				organizationId: 'EVIL-ORG',
				gscPropertyId: 'EVIL-PROP',
				startDate: '2025-05-06',
				endDate: '{{today-2}}',
				dimensions: ['date'],
				rowLimit: 100,
			},
		});

		// systemParams from the DB always win
		expect(view.params.organizationId).toBe('org-1');
		expect(view.params.gscPropertyId).toBe('prop-1');
	});

	// ADR 0001 — extend the whitelist so PATCH preserves all systemParam keys
	// any processor reads today (not just the original 4). Each entity-bound
	// endpoint adds its own systemParam; if PATCH ever drops one, the next
	// worker run for that endpoint silently breaks.
	it.each([
		'organizationId',
		'projectId',
		'trackedKeywordId',
		'gscPropertyId',
		'ga4PropertyId',
		'trackedPageId',
		'wikipediaArticleId',
		'bingPropertyId',
		'clarityProjectId',
		'monitoredDomainId',
	])('preserves systemParam %s on PATCH (defence in depth — ADR 0001)', async (key) => {
		const def = PC2.ProviderJobDefinition.schedule({
			id: 'def-whitelist' as PC2.ProviderJobDefinitionId,
			projectId: 'proj-1' as never,
			providerId: PC2.ProviderId.create('google-search-console'),
			endpointId: PC2.EndpointId.create('gsc-search-analytics'),
			params: { siteUrl: 'sc-domain:example.com', [key]: 'preserved-value' },
			cron: PC2.CronExpression.create('0 5 * * *'),
			credentialOverrideId: null,
			now: new Date('2026-05-05T00:00:00Z'),
		});
		const repo = {
			save: vi.fn(),
			findById: vi.fn().mockResolvedValue(def),
			deactivate: vi.fn(),
			delete: vi.fn(),
			listForProject: vi.fn(),
		} as unknown as PC2.JobDefinitionRepository;
		const scheduler = {
			register: vi.fn(),
			unregister: vi.fn(),
			enqueueOnce: vi.fn(),
		} satisfies PC2.JobScheduler;

		const uc = new UpdateJobDefUC2(repo, scheduler);
		const view = await uc.execute({
			definitionId: 'def-whitelist',
			// User PATCH does NOT include the system key — it must still survive.
			params: { siteUrl: 'sc-domain:other.com' },
		});

		expect(view.params[key]).toBe('preserved-value');
	});
});
