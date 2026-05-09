import type { ProjectManagement, RankTracking } from '@rankpulse/domain';
import { FakeClock, FixedIdGenerator, type Uuid } from '@rankpulse/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { RecordSerpObservationUseCase } from './record-serp-observation.use-case.js';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const OBS_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid;

class InMemorySerpObsRepo implements RankTracking.SerpObservationRepository {
	saved: RankTracking.SerpObservation[] = [];
	async save(obs: RankTracking.SerpObservation): Promise<void> {
		this.saved.push(obs);
	}
	async listLatestForProject(): Promise<readonly RankTracking.SerpObservation[]> {
		return [];
	}
	async listCompetitorSuggestions(): Promise<readonly RankTracking.CompetitorSuggestionRow[]> {
		return [];
	}
}

describe('RecordSerpObservationUseCase', () => {
	let repo: InMemorySerpObsRepo;
	let clock: FakeClock;
	let useCase: RecordSerpObservationUseCase;

	beforeEach(() => {
		repo = new InMemorySerpObsRepo();
		clock = new FakeClock(new Date('2026-05-09T14:32:11Z'));
		useCase = new RecordSerpObservationUseCase(repo, clock, new FixedIdGenerator([OBS_ID as Uuid]));
	});

	it('persists the SERP top-N as a single aggregate', async () => {
		const result = await useCase.execute({
			projectId: PROJECT_ID,
			phrase: 'control de rondas',
			country: 'ES',
			language: 'es',
			device: 'desktop',
			results: [
				{ rank: 1, domain: 'silvertrac.com', url: 'https://silvertrac.com/a', title: 'Silvertrac A' },
				{ rank: 2, domain: 'controlrondas.com', url: 'https://controlrondas.com/b', title: 'CR B' },
			],
			sourceProvider: 'dataforseo',
			rawPayloadId: null,
		});
		expect(result.persistedRows).toBe(2);
		expect(repo.saved).toHaveLength(1);
		const obs = repo.saved[0];
		expect(obs?.results.map((r) => r.rank)).toEqual([1, 2]);
		// observedAt is truncated to start-of-day UTC
		expect(obs?.observedAt.toISOString()).toBe('2026-05-09T00:00:00.000Z');
	});

	it('deduplicates results with the same rank — first wins', async () => {
		await useCase.execute({
			projectId: PROJECT_ID,
			phrase: 'kw',
			country: 'ES',
			language: 'es',
			device: 'desktop',
			results: [
				{ rank: 1, domain: 'a.com', url: null, title: null },
				{ rank: 1, domain: 'b.com', url: null, title: null },
			],
			sourceProvider: 'dataforseo',
			rawPayloadId: null,
		});
		const obs = repo.saved[0];
		expect(obs?.results).toHaveLength(1);
		expect(obs?.results[0]?.domain).toBe('a.com');
	});

	it('normalises domain (strips www., lowercases)', async () => {
		await useCase.execute({
			projectId: PROJECT_ID,
			phrase: 'kw',
			country: 'ES',
			language: 'es',
			device: 'desktop',
			results: [{ rank: 3, domain: 'WWW.Foo.COM', url: null, title: null }],
			sourceProvider: 'dataforseo',
			rawPayloadId: null,
		});
		expect(repo.saved[0]?.results[0]?.domain).toBe('foo.com');
	});
});
