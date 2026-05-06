import type { IdentityAccess, MacroContext, ProjectManagement } from '@rankpulse/domain';
import { FakeClock, FixedIdGenerator, NotFoundError, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AddMonitoredDomainUseCase } from './add-monitored-domain.use-case.js';
import { RecordRadarRankUseCase } from './record-radar-rank.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;

class InMemoryDomainRepo implements MacroContext.MonitoredDomainRepository {
	readonly store = new Map<string, MacroContext.MonitoredDomain>();
	readonly byTuple = new Map<string, MacroContext.MonitoredDomain>();
	async save(md: MacroContext.MonitoredDomain): Promise<void> {
		this.store.set(md.id, md);
		this.byTuple.set(`${md.projectId}|${md.domain.value}`, md);
	}
	async findById(id: MacroContext.MonitoredDomainId): Promise<MacroContext.MonitoredDomain | null> {
		return this.store.get(id) ?? null;
	}
	async findByProjectAndDomain(
		projectId: ProjectManagement.ProjectId,
		domain: string,
	): Promise<MacroContext.MonitoredDomain | null> {
		return this.byTuple.get(`${projectId}|${domain}`) ?? null;
	}
	async listForProject(): Promise<readonly MacroContext.MonitoredDomain[]> {
		return [];
	}
	async listForOrganization(): Promise<readonly MacroContext.MonitoredDomain[]> {
		return [];
	}
}

class InMemorySnapshotRepo implements MacroContext.RadarRankSnapshotRepository {
	readonly store = new Map<string, MacroContext.RadarRankSnapshot>();
	async save(snap: MacroContext.RadarRankSnapshot): Promise<{ inserted: boolean }> {
		const k = `${snap.monitoredDomainId}|${snap.observedDate}`;
		if (this.store.has(k)) return { inserted: false };
		this.store.set(k, snap);
		return { inserted: true };
	}
	async listForDomain(): Promise<readonly MacroContext.RadarRankSnapshot[]> {
		return [...this.store.values()];
	}
}

describe('RecordRadarRankUseCase', () => {
	let domainRepo: InMemoryDomainRepo;
	let snapshotRepo: InMemorySnapshotRepo;
	let events: RecordingEventPublisher;
	let monitoredDomainId: string;

	beforeEach(async () => {
		domainRepo = new InMemoryDomainRepo();
		snapshotRepo = new InMemorySnapshotRepo();
		events = new RecordingEventPublisher();
		const adder = new AddMonitoredDomainUseCase(
			domainRepo,
			new FakeClock('2026-05-04T10:00:00Z'),
			new FixedIdGenerator(['md-1' as Uuid]),
			events,
		);
		const result = await adder.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			domain: 'example.com',
		});
		monitoredDomainId = result.monitoredDomainId;
		events.clear();
	});

	const baseCommand = (overrides: Partial<{ rank: number | null; observedDate: string }> = {}) => ({
		monitoredDomainId,
		observedDate: overrides.observedDate ?? '2026-05-01',
		// Use `'rank' in overrides` rather than `??` so an explicit `rank: null`
		// override is preserved instead of being coerced to the default.
		rank: 'rank' in overrides ? (overrides.rank as number | null) : 142,
		bucket: '200',
		categories: { Technology: 8 },
		rawPayloadId: null,
	});

	const buildUseCase = () =>
		new RecordRadarRankUseCase(domainRepo, snapshotRepo, events, new FakeClock('2026-05-04T11:00:00Z'));

	it('persists the snapshot and publishes RadarRankRecorded on first insert', async () => {
		const useCase = buildUseCase();
		const result = await useCase.execute(baseCommand());
		expect(result.inserted).toBe(true);
		expect(snapshotRepo.store.size).toBe(1);
		expect(events.publishedTypes()).toContain('RadarRankRecorded');
	});

	it('does NOT publish event on idempotent re-fetch (same observedDate)', async () => {
		const useCase = buildUseCase();
		await useCase.execute(baseCommand());
		events.clear();
		const second = await useCase.execute(baseCommand());
		expect(second.inserted).toBe(false);
		expect(events.published()).toEqual([]);
	});

	it('persists rank: null for an unranked long-tail domain', async () => {
		const useCase = buildUseCase();
		await useCase.execute(baseCommand({ rank: null }));
		const [stored] = snapshotRepo.store.values();
		expect(stored?.rank.rank).toBeNull();
	});

	it('throws NotFoundError when the monitored domain does not exist', async () => {
		const useCase = buildUseCase();
		await expect(useCase.execute({ ...baseCommand(), monitoredDomainId: 'missing' })).rejects.toBeInstanceOf(
			NotFoundError,
		);
	});

	it('rejects negative or non-integer ranks at the aggregate boundary', async () => {
		const useCase = buildUseCase();
		await expect(useCase.execute({ ...baseCommand(), rank: -5 })).rejects.toThrow();
		await expect(useCase.execute({ ...baseCommand(), rank: 1.5 })).rejects.toThrow();
		expect(snapshotRepo.store.size).toBe(0);
	});
});
