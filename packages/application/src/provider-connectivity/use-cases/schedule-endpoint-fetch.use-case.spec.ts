import { type ProjectManagement, ProviderConnectivity } from '@rankpulse/domain';
import { FakeClock, FixedIdGenerator, InvalidInputError, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { describe, expect, it } from 'vitest';
import {
	type EndpointParamsValidator,
	ScheduleEndpointFetchUseCase,
} from './schedule-endpoint-fetch.use-case.js';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as ProjectManagement.ProjectId;
const ORG_ID = '22222222-2222-2222-2222-222222222222';
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

const buildUseCase = (validator: EndpointParamsValidator = passThroughValidator) => {
	const repo = new StubDefinitionRepo();
	const scheduler = new RecordingScheduler();
	const events = new RecordingEventPublisher();
	const useCase = new ScheduleEndpointFetchUseCase(
		repo,
		scheduler,
		validator,
		new FakeClock(new Date('2026-05-04T10:00:00Z')),
		new FixedIdGenerator(['def-id-1' as Uuid]),
		events,
	);
	return { useCase, repo, scheduler, events };
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
		const { useCase, repo, scheduler, events } = buildUseCase();

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
		const { useCase, repo, scheduler } = buildUseCase(reject);

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
		const { useCase, repo } = buildUseCase(normalize);

		await useCase.execute({ ...baseCmd, params: { keyword: 'control de rondas' } });

		expect(repo.saved[0]?.params).toMatchObject({ device: 'desktop' });
	});

	it('merges systemParams (organizationId, trackedKeywordId) AFTER validation so they survive Zod strip (BACKLOG #9)', async () => {
		const stripExtras: EndpointParamsValidator = {
			validate: () => ({ keyword: 'k', locationCode: 2724, languageCode: 'es', device: 'desktop' }),
		};
		const { useCase, repo } = buildUseCase(stripExtras);

		await useCase.execute({
			...baseCmd,
			systemParams: { organizationId: ORG_ID, trackedKeywordId: TRACKED_KW_ID },
		});

		expect(repo.saved[0]?.params).toMatchObject({
			keyword: 'k',
			organizationId: ORG_ID,
			trackedKeywordId: TRACKED_KW_ID,
		});
	});

	it('attaches the credentialOverrideId when provided', async () => {
		const { useCase, repo } = buildUseCase();
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
		const { useCase, repo, scheduler, events } = buildUseCase();
		repo.idempotencyHit = existing;

		const result = await useCase.execute({
			projectId: PROJECT_ID,
			providerId: 'google-search-console',
			endpointId: 'gsc-search-analytics',
			params: { siteUrl: 'sc-domain:example.com' },
			systemParams: { organizationId: ORG_ID, gscPropertyId: 'prop-1' },
			cron: '0 5 * * *',
			idempotencyKey: { systemParamKey: 'gscPropertyId', systemParamValue: 'prop-1' },
		});

		expect(result.definitionId).toBe(existingDefinitionId);
		// existing definition — no re-register, no save, no event
		expect(scheduler.registered).toHaveLength(0);
		expect(repo.saved).toHaveLength(0);
		expect(events.publishedTypes()).toHaveLength(0);
	});
});
