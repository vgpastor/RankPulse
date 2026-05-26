import type { IdentityAccess } from '@rankpulse/domain';
import { type ProjectManagement, ProviderConnectivity } from '@rankpulse/domain';
import { FakeClock, FixedIdGenerator, InvalidInputError, NotFoundError, type Uuid } from '@rankpulse/shared';
import { aProject, InMemoryProjectRepository, RecordingEventPublisher } from '@rankpulse/testing';
import { describe, expect, it } from 'vitest';
import {
	type EndpointParamsValidator,
	ScheduleEndpointFetchUseCase,
} from './schedule-endpoint-fetch.use-case.js';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as ProjectManagement.ProjectId;
const ORG_ID = '22222222-2222-2222-2222-222222222222' as Uuid as IdentityAccess.OrganizationId;
const TRACKED_KW_ID = '33333333-3333-3333-3333-333333333333';

class StubDefinitionRepo implements ProviderConnectivity.JobDefinitionRepository {
	readonly saved: ProviderConnectivity.ProviderJobDefinition[] = [];
	/** Optional pre-seeded definition returned by `findByProjectEndpointAndSystemParam`. */
	idempotencyHit: ProviderConnectivity.ProviderJobDefinition | null = null;
	async save(d: ProviderConnectivity.ProviderJobDefinition): Promise<void> {
		this.saved.push(d);
	}
	async findById() {
		return null;
	}
	async findFor() {
		return null;
	}
	async findByProjectEndpointAndSystemParam(): Promise<ProviderConnectivity.ProviderJobDefinition | null> {
		return this.idempotencyHit;
	}
	async listForProject(): Promise<readonly ProviderConnectivity.ProviderJobDefinition[]> {
		return this.saved;
	}
	async delete(): Promise<void> {}
}

class RecordingScheduler implements ProviderConnectivity.JobScheduler {
	readonly registered: ProviderConnectivity.ProviderJobDefinition[] = [];
	async register(d: ProviderConnectivity.ProviderJobDefinition): Promise<void> {
		this.registered.push(d);
	}
	async unregister(): Promise<void> {}
	async enqueueOnce(): Promise<void> {}
}

const passThroughValidator: EndpointParamsValidator = {
	validate: (_p, _e, params) => params as Record<string, unknown>,
};

const buildUseCase = async (validator: EndpointParamsValidator = passThroughValidator) => {
	const repo = new StubDefinitionRepo();
	const scheduler = new RecordingScheduler();
	const events = new RecordingEventPublisher();
	const projects = new InMemoryProjectRepository();
	// Pre-seed the project so `findById(PROJECT_ID)` returns a real
	// project with `organizationId === ORG_ID`. Required since the use
	// case now looks up the project to stamp organizationId.
	const project = aProject({ id: PROJECT_ID, organizationId: ORG_ID });
	await projects.save(project);
	const useCase = new ScheduleEndpointFetchUseCase(
		repo,
		scheduler,
		validator,
		new FakeClock(new Date('2026-05-04T10:00:00Z')),
		new FixedIdGenerator(['def-id-1' as Uuid]),
		events,
		projects,
	);
	return { useCase, repo, scheduler, events, projects };
};

const baseCmd = {
	projectId: PROJECT_ID,
	providerId: 'dataforseo',
	endpointId: 'serp-google-organic-live',
	params: { keyword: 'control de rondas', locationCode: 2724, languageCode: 'es' },
	cron: '0 6 * * 1',
};

describe('ScheduleEndpointFetchUseCase', () => {
	it('persists, registers in the scheduler, and emits an event for valid input', async () => {
		const { useCase, repo, scheduler, events } = await buildUseCase();

		const result = await useCase.execute(baseCmd);

		expect(result).toEqual({ definitionId: 'def-id-1' });
		expect(repo.saved).toHaveLength(1);
		expect(scheduler.registered).toHaveLength(1);
		expect(events.publishedTypes()).toContain('ProviderJobScheduled');
	});

	it('rejects with InvalidInputError when the endpoint paramsSchema rejects (BACKLOG #7)', async () => {
		const reject: EndpointParamsValidator = {
			validate: () => {
				throw new InvalidInputError(
					'Invalid params for dataforseo/serp-google-organic-live: keyword required',
				);
			},
		};
		const { useCase, repo, scheduler } = await buildUseCase(reject);

		await expect(useCase.execute({ ...baseCmd, params: { phrase: 'wrong-shape' } })).rejects.toBeInstanceOf(
			InvalidInputError,
		);
		expect(repo.saved).toHaveLength(0);
		expect(scheduler.registered).toHaveLength(0);
	});

	it('persists the validated params (post-Zod normalization), not the raw user input', async () => {
		const normalize: EndpointParamsValidator = {
			validate: () => ({
				keyword: 'control de rondas',
				locationCode: 2724,
				languageCode: 'es',
				device: 'desktop',
			}),
		};
		const { useCase, repo } = await buildUseCase(normalize);

		await useCase.execute({ ...baseCmd, params: { keyword: 'control de rondas' } });

		expect(repo.saved[0]?.params).toMatchObject({ device: 'desktop' });
	});

	it('merges systemParams (trackedKeywordId, …) AFTER validation so they survive Zod strip (BACKLOG #9)', async () => {
		const stripExtras: EndpointParamsValidator = {
			validate: () => ({ keyword: 'k', locationCode: 2724, languageCode: 'es', device: 'desktop' }),
		};
		const { useCase, repo } = await buildUseCase(stripExtras);

		await useCase.execute({
			...baseCmd,
			systemParams: { trackedKeywordId: TRACKED_KW_ID },
		});

		expect(repo.saved[0]?.params).toMatchObject({
			keyword: 'k',
			trackedKeywordId: TRACKED_KW_ID,
			// #147: projectId is unconditionally stamped so the worker IngestRouter
			// can scope persisted rows even when the caller did not pass it.
			projectId: PROJECT_ID,
			// Centralised stamping — the use case now derives organizationId from
			// the project itself (lookup via injected ProjectRepository) so every
			// caller, including auto-schedule handlers, gets it without remembering.
			organizationId: ORG_ID,
		});
	});

	it('attaches the credentialOverrideId when provided', async () => {
		const { useCase, repo } = await buildUseCase();
		const overrideId = '44444444-4444-4444-4444-444444444444';

		await useCase.execute({ ...baseCmd, credentialOverrideId: overrideId });

		expect(repo.saved[0]?.credentialOverrideId).toBe(overrideId);
	});

	it('returns the existing definitionId when idempotencyKey resolves an existing JobDefinition', async () => {
		const existingDefinitionId = 'existing-def-id' as ProviderConnectivity.ProviderJobDefinitionId;
		const existing = ProviderConnectivity.ProviderJobDefinition.schedule({
			id: existingDefinitionId,
			projectId: PROJECT_ID,
			providerId: ProviderConnectivity.ProviderId.create('google-search-console'),
			endpointId: ProviderConnectivity.EndpointId.create('gsc-search-analytics'),
			params: { siteUrl: 'sc-domain:example.com', gscPropertyId: 'prop-1' },
			cron: ProviderConnectivity.CronExpression.create('0 5 * * *'),
			credentialOverrideId: null,
			now: new Date('2026-05-04T00:00:00Z'),
		});
		const { useCase, repo, scheduler, events } = await buildUseCase();
		repo.idempotencyHit = existing;

		const result = await useCase.execute({
			projectId: PROJECT_ID,
			providerId: 'google-search-console',
			endpointId: 'gsc-search-analytics',
			params: { siteUrl: 'sc-domain:example.com' },
			systemParams: { gscPropertyId: 'prop-1' },
			cron: '0 5 * * *',
			idempotencyKey: { systemParamKey: 'gscPropertyId', systemParamValue: 'prop-1' },
		});

		expect(result.definitionId).toBe(existingDefinitionId);
		// existing definition — no re-register, no save, no event
		expect(scheduler.registered).toHaveLength(0);
		expect(repo.saved).toHaveLength(0);
		expect(events.publishedTypes()).toHaveLength(0);
	});

	// Regression guard: the worker processor requires `organizationId` in
	// systemParams and rejects the run BEFORE persisting the JobRun row
	// ("missing organizationId in systemParams"). Pre-fix only the manual
	// schedule controller stamped it; auto-schedule handlers (CompetitorAdded,
	// DomainAdded, GscPropertyLinked, …) skipped it, so every auto-scheduled
	// run failed invisibly. Centralising the lookup here means every caller
	// gets organizationId for free.
	it('stamps organizationId from the project even when the caller omits systemParams entirely', async () => {
		const { useCase, repo } = await buildUseCase();

		await useCase.execute(baseCmd); // no systemParams field at all

		expect(repo.saved[0]?.params).toMatchObject({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
		});
	});

	it('throws NotFoundError when the project does not exist (fail fast before persisting)', async () => {
		const { useCase, repo, scheduler } = await buildUseCase();

		await expect(
			useCase.execute({
				...baseCmd,
				projectId: '99999999-9999-9999-9999-999999999999' as ProjectManagement.ProjectId,
			}),
		).rejects.toBeInstanceOf(NotFoundError);
		expect(repo.saved).toHaveLength(0);
		expect(scheduler.registered).toHaveLength(0);
	});
});
