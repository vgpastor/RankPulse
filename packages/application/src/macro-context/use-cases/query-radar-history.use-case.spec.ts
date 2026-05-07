import { type IdentityAccess, MacroContext, type ProjectManagement } from '@rankpulse/domain';
import { NotFoundError, type Uuid } from '@rankpulse/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryRadarHistoryUseCase } from './query-radar-history.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const DOMAIN_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid as MacroContext.MonitoredDomainId;
const OTHER_DOMAIN_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab' as Uuid as MacroContext.MonitoredDomainId;

class InMemoryDomainRepo implements MacroContext.MonitoredDomainRepository {
	readonly store = new Map<string, MacroContext.MonitoredDomain>();
	async save(d: MacroContext.MonitoredDomain): Promise<void> {
		this.store.set(d.id, d);
	}
	async findById(id: MacroContext.MonitoredDomainId): Promise<MacroContext.MonitoredDomain | null> {
		return this.store.get(id) ?? null;
	}
	async findByProjectAndDomain(): Promise<MacroContext.MonitoredDomain | null> {
		return null;
	}
	async listForProject(): Promise<readonly MacroContext.MonitoredDomain[]> {
		return [];
	}
	async listForOrganization(): Promise<readonly MacroContext.MonitoredDomain[]> {
		return [];
	}
}

class InMemorySnapshotRepo implements MacroContext.RadarRankSnapshotRepository {
	readonly rows: MacroContext.RadarRankSnapshot[] = [];
	async save(s: MacroContext.RadarRankSnapshot): Promise<{ inserted: boolean }> {
		this.rows.push(s);
		return { inserted: true };
	}
	async listForDomain(
		monitoredDomainId: MacroContext.MonitoredDomainId,
		query: { from: string; to: string },
	): Promise<readonly MacroContext.RadarRankSnapshot[]> {
		return this.rows
			.filter((r) => r.monitoredDomainId === monitoredDomainId)
			.filter((r) => r.observedDate >= query.from && r.observedDate <= query.to)
			.sort((a, b) => a.observedDate.localeCompare(b.observedDate));
	}
}

const buildSnapshot = (overrides: {
	observedDate: string;
	rank?: number | null;
	monitoredDomainId?: MacroContext.MonitoredDomainId;
}): MacroContext.RadarRankSnapshot =>
	MacroContext.RadarRankSnapshot.record({
		monitoredDomainId: overrides.monitoredDomainId ?? DOMAIN_ID,
		projectId: PROJECT_ID,
		observedDate: overrides.observedDate,
		rank: MacroContext.RadarRank.create({
			rank: overrides.rank === undefined ? 1234 : overrides.rank,
			bucket: 'top-10000',
			categories: { Technology: 50 },
		}),
		rawPayloadId: null,
	});

describe('QueryRadarHistoryUseCase', () => {
	let domainRepo: InMemoryDomainRepo;
	let snapRepo: InMemorySnapshotRepo;
	let useCase: QueryRadarHistoryUseCase;

	beforeEach(async () => {
		domainRepo = new InMemoryDomainRepo();
		snapRepo = new InMemorySnapshotRepo();
		useCase = new QueryRadarHistoryUseCase(domainRepo, snapRepo);
		await domainRepo.save(
			MacroContext.MonitoredDomain.add({
				id: DOMAIN_ID,
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				domain: 'example.com',
				credentialId: null,
				now: new Date('2026-05-04T10:00:00Z'),
			}),
		);
	});

	it('returns snapshots in window for the monitored domain', async () => {
		await snapRepo.save(buildSnapshot({ observedDate: '2026-05-01', rank: 1000 }));
		await snapRepo.save(buildSnapshot({ observedDate: '2026-05-02', rank: 950 }));

		const result = await useCase.execute({
			monitoredDomainId: DOMAIN_ID,
			from: '2026-05-01',
			to: '2026-05-02',
		});

		expect(result).toHaveLength(2);
		expect(result.map((r) => r.rank)).toEqual([1000, 950]);
		expect(result[0]?.bucket).toBe('top-10000');
		expect(result[0]?.categories).toEqual({ Technology: 50 });
	});

	it('throws NotFoundError when the monitored domain does not exist', async () => {
		await expect(
			useCase.execute({ monitoredDomainId: 'missing', from: '2026-05-01', to: '2026-05-02' }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('honours the date window', async () => {
		await snapRepo.save(buildSnapshot({ observedDate: '2026-04-30' }));
		await snapRepo.save(buildSnapshot({ observedDate: '2026-05-15' }));

		const result = await useCase.execute({
			monitoredDomainId: DOMAIN_ID,
			from: '2026-05-01',
			to: '2026-05-31',
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.observedDate).toBe('2026-05-15');
	});

	it('serialises rank=null when the domain is unranked', async () => {
		await snapRepo.save(buildSnapshot({ observedDate: '2026-05-01', rank: null }));

		const result = await useCase.execute({
			monitoredDomainId: DOMAIN_ID,
			from: '2026-05-01',
			to: '2026-05-01',
		});

		expect(result[0]?.rank).toBeNull();
	});

	it('scopes results to the requested domain', async () => {
		await domainRepo.save(
			MacroContext.MonitoredDomain.add({
				id: OTHER_DOMAIN_ID,
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				domain: 'other.com',
				credentialId: null,
				now: new Date('2026-05-04T10:00:00Z'),
			}),
		);
		await snapRepo.save(buildSnapshot({ observedDate: '2026-05-01', rank: 100 }));
		await snapRepo.save(
			buildSnapshot({
				observedDate: '2026-05-01',
				rank: 999,
				monitoredDomainId: OTHER_DOMAIN_ID,
			}),
		);

		const result = await useCase.execute({
			monitoredDomainId: DOMAIN_ID,
			from: '2026-05-01',
			to: '2026-05-01',
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.rank).toBe(100);
	});
});
