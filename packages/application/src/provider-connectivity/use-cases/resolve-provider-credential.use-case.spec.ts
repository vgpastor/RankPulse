import { ProviderConnectivity } from '@rankpulse/domain';
import { type Clock, FakeClock, type Uuid } from '@rankpulse/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { ResolveProviderCredentialUseCase } from './resolve-provider-credential.use-case.js';

const orgId = '11111111-1111-1111-1111-111111111111' as Uuid as ProviderConnectivity.ProviderCredentialId;
const portfolioId = '22222222-2222-2222-2222-222222222222' as Uuid;
const projectId = '33333333-3333-3333-3333-333333333333' as Uuid;
const domain = 'controlrondas.com';

const dummySecret = (): ProviderConnectivity.EncryptedSecret =>
	ProviderConnectivity.EncryptedSecret.fromEnvelope({
		ciphertext: 'cipher-text-base64',
		nonce: 'nonce-base64',
		lastFour: '0001',
	});

class InMemoryRepo implements ProviderConnectivity.CredentialRepository {
	store = new Map<string, ProviderConnectivity.ProviderCredential>();
	async save(c: ProviderConnectivity.ProviderCredential): Promise<void> {
		this.store.set(c.id, c);
	}
	async findById(
		id: ProviderConnectivity.ProviderCredentialId,
	): Promise<ProviderConnectivity.ProviderCredential | null> {
		return this.store.get(id) ?? null;
	}
	async listForProvider(): Promise<readonly ProviderConnectivity.ProviderCredential[]> {
		return [...this.store.values()];
	}
	async findByScope(): Promise<ProviderConnectivity.ProviderCredential | null> {
		return null;
	}
}

const fakeVault: ProviderConnectivity.CredentialVault = {
	async encrypt() {
		return dummySecret();
	},
	async decrypt() {
		return 'PLAINTEXT';
	},
};

describe('ResolveProviderCredentialUseCase', () => {
	let repo: InMemoryRepo;
	let clock: Clock;
	let useCase: ResolveProviderCredentialUseCase;
	const now = new Date('2026-05-04T10:00:00Z');

	const credAt = (
		id: string,
		scope: ProviderConnectivity.CredentialScope,
		createdAt: Date,
	): ProviderConnectivity.ProviderCredential =>
		ProviderConnectivity.ProviderCredential.rehydrate({
			id: id as ProviderConnectivity.ProviderCredentialId,
			organizationId: orgId,
			providerId: ProviderConnectivity.ProviderId.create('dataforseo'),
			scope,
			label: 'default',
			encryptedSecret: dummySecret(),
			expiresAt: null,
			revokedAt: null,
			createdAt,
		});

	beforeEach(() => {
		repo = new InMemoryRepo();
		clock = new FakeClock(now);
		useCase = new ResolveProviderCredentialUseCase(repo, fakeVault, clock);
	});

	it('falls back to the org credential when no specific scope matches', async () => {
		await repo.save(
			credAt(
				'aaaaaaaa-1111-aaaa-aaaa-aaaaaaaaaaaa',
				ProviderConnectivity.CredentialScope.fromRaw({ type: 'org', id: orgId }),
				new Date('2026-01-01T00:00:00Z'),
			),
		);
		const result = await useCase.execute({
			organizationId: orgId,
			providerId: 'dataforseo',
			hints: { domain, projectId },
		});
		expect(result.scope.type).toBe('org');
	});

	it('prefers a project-scoped credential over an org one', async () => {
		await repo.save(
			credAt(
				'aaaaaaaa-1111-aaaa-aaaa-aaaaaaaaaaaa',
				ProviderConnectivity.CredentialScope.fromRaw({ type: 'org', id: orgId }),
				new Date('2026-01-01T00:00:00Z'),
			),
		);
		await repo.save(
			credAt(
				'bbbbbbbb-2222-bbbb-bbbb-bbbbbbbbbbbb',
				ProviderConnectivity.CredentialScope.fromRaw({ type: 'project', id: projectId }),
				new Date('2026-02-01T00:00:00Z'),
			),
		);
		const result = await useCase.execute({
			organizationId: orgId,
			providerId: 'dataforseo',
			hints: { domain, projectId, portfolioId },
		});
		expect(result.scope).toEqual({ type: 'project', id: projectId });
	});

	it('prefers a domain-scoped credential over project / portfolio / org', async () => {
		await repo.save(
			credAt(
				'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
				ProviderConnectivity.CredentialScope.fromRaw({ type: 'org', id: orgId }),
				new Date('2026-01-01T00:00:00Z'),
			),
		);
		await repo.save(
			credAt(
				'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
				ProviderConnectivity.CredentialScope.fromRaw({ type: 'project', id: projectId }),
				new Date('2026-02-01T00:00:00Z'),
			),
		);
		await repo.save(
			credAt(
				'cccc3333-cccc-cccc-cccc-cccccccccccc',
				ProviderConnectivity.CredentialScope.fromRaw({ type: 'domain', id: domain }),
				new Date('2026-03-01T00:00:00Z'),
			),
		);
		const result = await useCase.execute({
			organizationId: orgId,
			providerId: 'dataforseo',
			hints: { domain, projectId, portfolioId },
		});
		expect(result.scope).toEqual({ type: 'domain', id: domain });
	});

	it('honors explicit override regardless of scope', async () => {
		const override = credAt(
			'dddd4444-dddd-dddd-dddd-dddddddddddd',
			ProviderConnectivity.CredentialScope.fromRaw({ type: 'org', id: orgId }),
			new Date('2026-01-01T00:00:00Z'),
		);
		await repo.save(override);
		await repo.save(
			credAt(
				'eeee5555-eeee-eeee-eeee-eeeeeeeeeeee',
				ProviderConnectivity.CredentialScope.fromRaw({ type: 'project', id: projectId }),
				new Date('2026-02-01T00:00:00Z'),
			),
		);
		const result = await useCase.execute({
			organizationId: orgId,
			providerId: 'dataforseo',
			hints: { domain, projectId },
			overrideCredentialId: override.id,
		});
		expect(result.credentialId).toBe(override.id);
	});

	it('throws when no usable credential exists', async () => {
		await expect(
			useCase.execute({
				organizationId: orgId,
				providerId: 'dataforseo',
				hints: { domain, projectId },
			}),
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});
