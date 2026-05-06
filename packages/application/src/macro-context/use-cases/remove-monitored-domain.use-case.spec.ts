import type { IdentityAccess, MacroContext, ProjectManagement } from '@rankpulse/domain';
import { FakeClock, FixedIdGenerator, NotFoundError, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AddMonitoredDomainUseCase } from './add-monitored-domain.use-case.js';
import { RemoveMonitoredDomainUseCase } from './remove-monitored-domain.use-case.js';

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
		return [...this.store.values()];
	}
	async listForOrganization(): Promise<readonly MacroContext.MonitoredDomain[]> {
		return [...this.store.values()];
	}
}

describe('RemoveMonitoredDomainUseCase', () => {
	let repo: InMemoryDomainRepo;
	let events: RecordingEventPublisher;
	let monitoredDomainId: string;

	beforeEach(async () => {
		repo = new InMemoryDomainRepo();
		events = new RecordingEventPublisher();
		const adder = new AddMonitoredDomainUseCase(
			repo,
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

	it('marks the monitored domain as removed and persists it', async () => {
		const useCase = new RemoveMonitoredDomainUseCase(repo, new FakeClock('2026-05-05T11:00:00Z'));

		await useCase.execute({ monitoredDomainId });

		const stored = await repo.findById(monitoredDomainId as MacroContext.MonitoredDomainId);
		expect(stored?.isActive()).toBe(false);
		expect(stored?.removedAt).toEqual(new Date('2026-05-05T11:00:00Z'));
	});

	it('is idempotent — second remove on the same domain is a no-op', async () => {
		const useCase = new RemoveMonitoredDomainUseCase(repo, new FakeClock('2026-05-05T11:00:00Z'));
		await useCase.execute({ monitoredDomainId });
		const firstRemovedAt = (await repo.findById(monitoredDomainId as MacroContext.MonitoredDomainId))
			?.removedAt;

		// A fresh clock value would mutate the row if remove() were called twice.
		const useCase2 = new RemoveMonitoredDomainUseCase(repo, new FakeClock('2026-05-06T11:00:00Z'));
		await expect(useCase2.execute({ monitoredDomainId })).resolves.toBeUndefined();

		const stored = await repo.findById(monitoredDomainId as MacroContext.MonitoredDomainId);
		expect(stored?.removedAt).toEqual(firstRemovedAt);
	});

	it('throws NotFoundError when the monitored domain does not exist', async () => {
		const useCase = new RemoveMonitoredDomainUseCase(repo, new FakeClock('2026-05-05T11:00:00Z'));
		await expect(useCase.execute({ monitoredDomainId: 'missing' })).rejects.toBeInstanceOf(NotFoundError);
	});
});
