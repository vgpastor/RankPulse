import { ProviderConnectivity } from '@rankpulse/domain';
import { describe, expect, it } from 'vitest';
import { ListJobRunsUseCase } from './list-job-runs.use-case.js';

const buildRun = (id: string, startedAt: Date) =>
	ProviderConnectivity.ProviderJobRun.start({
		id: id as ProviderConnectivity.ProviderJobRunId,
		definitionId: 'def-1' as ProviderConnectivity.ProviderJobDefinitionId,
		credentialId: null,
		now: startedAt,
	});

class StubRunRepo implements ProviderConnectivity.JobRunRepository {
	readonly store: ProviderConnectivity.ProviderJobRun[] = [];
	async save(r: ProviderConnectivity.ProviderJobRun): Promise<void> {
		this.store.push(r);
	}
	async findById() {
		return null;
	}
	async listForDefinition(
		_id: ProviderConnectivity.ProviderJobDefinitionId,
		limit = 50,
	): Promise<readonly ProviderConnectivity.ProviderJobRun[]> {
		return this.store.slice(0, limit);
	}
}

describe('ListJobRunsUseCase', () => {
	it('returns the runs as views ordered as the repo returns them', async () => {
		const repo = new StubRunRepo();
		await repo.save(buildRun('run-1', new Date('2026-05-04T08:00:00Z')));
		await repo.save(buildRun('run-2', new Date('2026-05-03T08:00:00Z')));

		const result = await new ListJobRunsUseCase(repo).execute({ definitionId: 'def-1' });

		expect(result.map((r) => r.id)).toEqual(['run-1', 'run-2']);
		expect(result[0]?.status).toBe('running');
		expect(result[0]?.startedAt).toBe('2026-05-04T08:00:00.000Z');
		expect(result[0]?.finishedAt).toBeNull();
	});

	it('respects the limit parameter', async () => {
		const repo = new StubRunRepo();
		for (let i = 0; i < 10; i++) {
			await repo.save(buildRun(`run-${i}`, new Date(`2026-05-0${(i % 9) + 1}T08:00:00Z`)));
		}

		const result = await new ListJobRunsUseCase(repo).execute({ definitionId: 'def-1', limit: 3 });

		expect(result).toHaveLength(3);
	});

	it('returns an empty array when there are no runs', async () => {
		const result = await new ListJobRunsUseCase(new StubRunRepo()).execute({ definitionId: 'def-1' });
		expect(result).toEqual([]);
	});
});
