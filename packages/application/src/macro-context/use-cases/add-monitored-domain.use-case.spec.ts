import type { IdentityAccess, MacroContext, ProjectManagement } from '@rankpulse/domain';
import { ConflictError, FakeClock, FixedIdGenerator, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AddMonitoredDomainUseCase } from './add-monitored-domain.use-case.js';

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

describe('AddMonitoredDomainUseCase', () => {
	let repo: InMemoryDomainRepo;
	let events: RecordingEventPublisher;
	const buildUseCase = (ids: Uuid[]) =>
		new AddMonitoredDomainUseCase(
			repo,
			new FakeClock('2026-05-04T10:00:00Z'),
			new FixedIdGenerator(ids),
			events,
		);

	beforeEach(() => {
		repo = new InMemoryDomainRepo();
		events = new RecordingEventPublisher();
	});

	it('persists a fresh monitored domain (canonicalised) and emits MonitoredDomainAdded', async () => {
		const useCase = buildUseCase(['md-1' as Uuid]);

		const { monitoredDomainId } = await useCase.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			domain: 'Example.COM',
		});

		expect(monitoredDomainId).toBe('md-1');
		expect(repo.store.size).toBe(1);
		const stored = repo.store.get(monitoredDomainId);
		expect(stored?.domain.value).toBe('example.com'); // canonicalised
		expect(stored?.isActive()).toBe(true);
		expect(events.publishedTypes()).toContain('MonitoredDomainAdded');
	});

	it('persists the credentialId when provided', async () => {
		const useCase = buildUseCase(['md-1' as Uuid]);

		const { monitoredDomainId } = await useCase.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			domain: 'example.com',
			credentialId: 'cred-123',
		});

		expect(repo.store.get(monitoredDomainId)?.credentialId).toBe('cred-123');
	});

	it('defaults credentialId to null when omitted', async () => {
		const useCase = buildUseCase(['md-1' as Uuid]);
		const { monitoredDomainId } = await useCase.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			domain: 'example.com',
		});
		expect(repo.store.get(monitoredDomainId)?.credentialId).toBeNull();
	});

	it('throws ConflictError when the domain is already active for the same project', async () => {
		const useCase = buildUseCase(['md-1' as Uuid, 'md-2' as Uuid]);
		await useCase.execute({ organizationId: ORG_ID, projectId: PROJECT_ID, domain: 'example.com' });

		await expect(
			useCase.execute({ organizationId: ORG_ID, projectId: PROJECT_ID, domain: 'example.com' }),
		).rejects.toBeInstanceOf(ConflictError);
		// Only the first row should have been written.
		expect(repo.store.size).toBe(1);
	});

	it('rejects malformed domain names before touching the repo', async () => {
		const useCase = buildUseCase(['md-1' as Uuid]);
		await expect(
			useCase.execute({ organizationId: ORG_ID, projectId: PROJECT_ID, domain: 'not a domain' }),
		).rejects.toThrow();
		expect(repo.store.size).toBe(0);
		expect(events.published()).toHaveLength(0);
	});
});
