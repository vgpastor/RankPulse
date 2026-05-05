import { ProviderConnectivity } from '@rankpulse/domain';
import { FixedIdGenerator, NotFoundError, type Uuid } from '@rankpulse/shared';
import { describe, expect, it } from 'vitest';
import { TriggerJobDefinitionRunUseCase } from './trigger-job-definition-run.use-case.js';

class StubDefinitionRepo implements ProviderConnectivity.JobDefinitionRepository {
	private readonly store = new Map<string, ProviderConnectivity.ProviderJobDefinition>();
	put(def: ProviderConnectivity.ProviderJobDefinition): void {
		this.store.set(def.id, def);
	}
	async save(def: ProviderConnectivity.ProviderJobDefinition): Promise<void> {
		this.store.set(def.id, def);
	}
	async findById(
		id: ProviderConnectivity.ProviderJobDefinitionId,
	): Promise<ProviderConnectivity.ProviderJobDefinition | null> {
		return this.store.get(id) ?? null;
	}
	async findFor(): Promise<ProviderConnectivity.ProviderJobDefinition | null> {
		return null;
	}
	async listForProject(): Promise<readonly ProviderConnectivity.ProviderJobDefinition[]> {
		return [...this.store.values()];
	}
	async delete(id: ProviderConnectivity.ProviderJobDefinitionId): Promise<void> {
		this.store.delete(id);
	}
}

class RecordingScheduler implements ProviderConnectivity.JobScheduler {
	readonly enqueueOnceCalls: { definitionId: string; runId: string }[] = [];
	async register(): Promise<void> {}
	async unregister(): Promise<void> {}
	async enqueueOnce(definition: ProviderConnectivity.ProviderJobDefinition, runId: string): Promise<void> {
		this.enqueueOnceCalls.push({ definitionId: definition.id, runId });
	}
}

const aDefinition = (id = 'def-1' as ProviderConnectivity.ProviderJobDefinitionId) =>
	ProviderConnectivity.ProviderJobDefinition.schedule({
		id,
		projectId: 'proj-1' as ProviderConnectivity.ProviderJobDefinition['projectId'],
		providerId: ProviderConnectivity.ProviderId.create('dataforseo'),
		endpointId: ProviderConnectivity.EndpointId.create('serp-google-organic-live'),
		params: { phrase: 'control de rondas', country: 'ES', language: 'es-ES', device: 'desktop' },
		cron: ProviderConnectivity.CronExpression.create('0 6 * * 1'),
		credentialOverrideId: null,
		now: new Date('2026-05-04T00:00:00Z'),
	});

describe('TriggerJobDefinitionRunUseCase', () => {
	it('enqueues a one-off run and returns the generated runId', async () => {
		const definition = aDefinition();
		const repo = new StubDefinitionRepo();
		repo.put(definition);
		const scheduler = new RecordingScheduler();
		const ids = new FixedIdGenerator(['run-42' as Uuid]);

		const useCase = new TriggerJobDefinitionRunUseCase(repo, scheduler, ids);
		const result = await useCase.execute({ definitionId: definition.id });

		expect(result).toEqual({ runId: 'run-42', definitionId: definition.id });
		expect(scheduler.enqueueOnceCalls).toEqual([{ definitionId: definition.id, runId: 'run-42' }]);
	});

	it('throws NotFoundError when the definition does not exist', async () => {
		const repo = new StubDefinitionRepo();
		const scheduler = new RecordingScheduler();
		const ids = new FixedIdGenerator(['unused' as Uuid]);
		const useCase = new TriggerJobDefinitionRunUseCase(repo, scheduler, ids);

		await expect(useCase.execute({ definitionId: 'missing' })).rejects.toBeInstanceOf(NotFoundError);
		expect(scheduler.enqueueOnceCalls).toHaveLength(0);
	});
});
