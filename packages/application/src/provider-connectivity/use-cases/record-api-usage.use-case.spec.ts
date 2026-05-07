import type { IdentityAccess, ProjectManagement, ProviderConnectivity } from '@rankpulse/domain';
import { FakeClock, FixedIdGenerator, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { RecordApiUsageUseCase } from './record-api-usage.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const CREDENTIAL_ID =
	'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' as Uuid as ProviderConnectivity.ProviderCredentialId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const USAGE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid;

class InMemoryApiUsageRepo implements ProviderConnectivity.ApiUsageRepository {
	readonly entries: ProviderConnectivity.ApiUsageEntry[] = [];
	async save(entry: ProviderConnectivity.ApiUsageEntry): Promise<void> {
		this.entries.push(entry);
	}
	async sumCostCents(_orgId: IdentityAccess.OrganizationId, _from: Date, _to: Date): Promise<number> {
		return this.entries.reduce((sum, e) => sum + e.cost.cents, 0);
	}
}

describe('RecordApiUsageUseCase', () => {
	let repo: InMemoryApiUsageRepo;
	let clock: FakeClock;
	let publisher: RecordingEventPublisher;
	let useCase: RecordApiUsageUseCase;

	beforeEach(() => {
		repo = new InMemoryApiUsageRepo();
		clock = new FakeClock('2026-05-05T12:00:00Z');
		publisher = new RecordingEventPublisher();
		useCase = new RecordApiUsageUseCase(repo, clock, new FixedIdGenerator([USAGE_ID]), publisher);
	});

	it('persists the usage entry and emits ApiUsageRecorded', async () => {
		const result = await useCase.execute({
			organizationId: ORG_ID,
			credentialId: CREDENTIAL_ID,
			projectId: PROJECT_ID,
			providerId: 'openai',
			endpointId: 'openai-responses-with-web-search',
			calls: 1,
			costCents: 305,
		});

		expect(result.usageId).toBe(USAGE_ID);
		expect(repo.entries).toHaveLength(1);
		expect(repo.entries[0]?.cost.cents).toBe(305);
		expect(publisher.publishedTypes()).toContain('ApiUsageRecorded');
	});

	it('handles a null projectId (org-scope-only credentials)', async () => {
		const result = await useCase.execute({
			organizationId: ORG_ID,
			credentialId: CREDENTIAL_ID,
			projectId: null,
			providerId: 'openai',
			endpointId: 'openai-responses-with-web-search',
			calls: 1,
			costCents: 305,
		});

		expect(result.usageId).toBe(USAGE_ID);
		expect(repo.entries[0]?.projectId).toBeNull();
	});

	it('stamps occurredAt from the injected clock', async () => {
		await useCase.execute({
			organizationId: ORG_ID,
			credentialId: CREDENTIAL_ID,
			projectId: PROJECT_ID,
			providerId: 'openai',
			endpointId: 'openai-responses-with-web-search',
			calls: 1,
			costCents: 305,
		});

		expect(repo.entries[0]?.occurredAt).toEqual(new Date('2026-05-05T12:00:00Z'));
	});
});
