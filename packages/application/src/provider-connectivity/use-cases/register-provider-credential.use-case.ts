import { type IdentityAccess, ProviderConnectivity, type SharedKernel } from '@rankpulse/domain';
import { type Clock, ConflictError, type IdGenerator } from '@rankpulse/shared';

export interface RegisterProviderCredentialCommand {
	organizationId: string;
	providerId: string;
	scope: { type: string; id: string };
	label: string;
	plaintextSecret: string;
	expiresAt?: Date | null;
}

export interface RegisterProviderCredentialResult {
	credentialId: string;
	lastFour: string;
}

export class RegisterProviderCredentialUseCase {
	constructor(
		private readonly credentials: ProviderConnectivity.CredentialRepository,
		private readonly vault: ProviderConnectivity.CredentialVault,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: RegisterProviderCredentialCommand): Promise<RegisterProviderCredentialResult> {
		const orgId = cmd.organizationId as IdentityAccess.OrganizationId;
		const providerId = ProviderConnectivity.ProviderId.create(cmd.providerId);
		const scope = ProviderConnectivity.CredentialScope.fromRaw(cmd.scope);

		const existing = await this.credentials.findByScope(orgId, providerId, scope, cmd.label);
		if (existing) {
			throw new ConflictError(
				`Credential "${cmd.label}" already exists for ${providerId.value} at scope ${scope.toString()}`,
			);
		}

		const encrypted = await this.vault.encrypt(cmd.plaintextSecret);
		const id = this.ids.generate() as ProviderConnectivity.ProviderCredentialId;
		const credential = ProviderConnectivity.ProviderCredential.register({
			id,
			organizationId: orgId,
			providerId,
			scope,
			label: cmd.label,
			encryptedSecret: encrypted,
			expiresAt: cmd.expiresAt ?? null,
			now: this.clock.now(),
		});

		await this.credentials.save(credential);
		await this.events.publish(credential.pullEvents());

		return { credentialId: id, lastFour: encrypted.lastFour };
	}
}
