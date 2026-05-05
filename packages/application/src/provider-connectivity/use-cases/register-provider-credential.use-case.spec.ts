import { type IdentityAccess, ProviderConnectivity } from '@rankpulse/domain';
import { ConflictError, FakeClock, FixedIdGenerator, InvalidInputError, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { describe, expect, it } from 'vitest';
import {
	type CredentialFormatValidator,
	RegisterProviderCredentialUseCase,
} from './register-provider-credential.use-case.js';

const ORG_ID = '11111111-1111-1111-1111-111111111111' as IdentityAccess.OrganizationId;
const PROJECT_ID = '22222222-2222-2222-2222-222222222222';

class InMemoryCredentialRepo implements ProviderConnectivity.CredentialRepository {
	readonly store = new Map<string, ProviderConnectivity.ProviderCredential>();
	async save(c: ProviderConnectivity.ProviderCredential): Promise<void> {
		this.store.set(c.id, c);
	}
	async findById(id: ProviderConnectivity.ProviderCredentialId) {
		return this.store.get(id) ?? null;
	}
	async listForProvider() {
		return [...this.store.values()];
	}
	async findByScope(
		_orgId: IdentityAccess.OrganizationId,
		_providerId: ProviderConnectivity.ProviderId,
		scope: ProviderConnectivity.CredentialScope,
		label: string,
	) {
		const match = [...this.store.values()].find(
			(c) =>
				c.scope.type === scope.type &&
				c.scope.id === scope.id &&
				c.label === label &&
				c.organizationId === _orgId &&
				c.providerId.value === _providerId.value,
		);
		return match ?? null;
	}
}

const fakeVault: ProviderConnectivity.CredentialVault = {
	async encrypt(plain: string) {
		return ProviderConnectivity.EncryptedSecret.fromEnvelope({
			ciphertext: Buffer.from(plain).toString('base64'),
			nonce: 'nonce-base64',
			lastFour: plain.slice(-4),
		});
	},
	async decrypt() {
		return 'PLAINTEXT';
	},
};

const okValidator: CredentialFormatValidator = { validate: () => {} };

const buildUseCase = (overrides: { validator?: CredentialFormatValidator } = {}) => {
	const repo = new InMemoryCredentialRepo();
	const events = new RecordingEventPublisher();
	const useCase = new RegisterProviderCredentialUseCase(
		repo,
		fakeVault,
		overrides.validator ?? okValidator,
		new FakeClock(new Date('2026-05-04T10:00:00Z')),
		new FixedIdGenerator(['cred-id-1' as Uuid]),
		events,
	);
	return { useCase, repo, events };
};

const baseCmd = {
	organizationId: ORG_ID,
	providerId: 'dataforseo',
	scope: { type: 'project', id: PROJECT_ID },
	label: 'default',
	plaintextSecret: 'foo@x.com|secret',
};

describe('RegisterProviderCredentialUseCase', () => {
	it('persists, encrypts, and emits an event when the format validator accepts the secret', async () => {
		const { useCase, repo, events } = buildUseCase();

		const result = await useCase.execute(baseCmd);

		expect(result).toEqual({ credentialId: 'cred-id-1', lastFour: 'cret' });
		expect(repo.store.size).toBe(1);
		expect(events.publishedTypes()).toContain('ProviderCredentialRegistered');
	});

	it('rejects with InvalidInputError when the format validator throws (BACKLOG #8)', async () => {
		const reject: CredentialFormatValidator = {
			validate: () => {
				throw new InvalidInputError('DataForSEO credential must be "email|api_password"');
			},
		};
		const { useCase, repo, events } = buildUseCase({ validator: reject });

		await expect(
			useCase.execute({ ...baseCmd, plaintextSecret: 'foo@x.com:bad-separator' }),
		).rejects.toBeInstanceOf(InvalidInputError);
		expect(repo.store.size).toBe(0);
		expect(events.publishedTypes()).toEqual([]);
	});

	it('passes the providerId and plaintext to the validator unmodified', async () => {
		const captured: { providerId?: string; plain?: string } = {};
		const spy: CredentialFormatValidator = {
			validate: (providerId, plain) => {
				captured.providerId = providerId;
				captured.plain = plain;
			},
		};
		const { useCase } = buildUseCase({ validator: spy });

		await useCase.execute({ ...baseCmd, plaintextSecret: 'foo@x.com|secret' });

		expect(captured).toEqual({ providerId: 'dataforseo', plain: 'foo@x.com|secret' });
	});

	it('rejects duplicate (org, provider, scope, label) tuples with ConflictError', async () => {
		const { useCase } = buildUseCase();
		await useCase.execute(baseCmd);

		await expect(useCase.execute(baseCmd)).rejects.toBeInstanceOf(ConflictError);
	});
});
