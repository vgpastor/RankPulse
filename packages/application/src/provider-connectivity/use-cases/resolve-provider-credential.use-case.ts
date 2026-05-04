import { type IdentityAccess, ProviderConnectivity } from '@rankpulse/domain';
import { type Clock, NotFoundError } from '@rankpulse/shared';

export interface ResolveProviderCredentialCommand {
	organizationId: string;
	providerId: string;
	/** Cascade order: domain → project → portfolio → org. Pass `null` to skip a level. */
	hints: {
		domain?: string | null;
		projectId?: string | null;
		portfolioId?: string | null;
	};
	overrideCredentialId?: string | null;
}

export interface ResolvedCredential {
	credentialId: string;
	scope: { type: string; id: string };
	plaintextSecret: string;
}

/**
 * Cascade-resolves the most specific usable credential matching the request.
 * Order: domain (most specific) → project → portfolio → org (fallback).
 *
 * Optionally honors an explicit override credential id (set on a job
 * definition) which short-circuits the cascade.
 */
export class ResolveProviderCredentialUseCase {
	constructor(
		private readonly credentials: ProviderConnectivity.CredentialRepository,
		private readonly vault: ProviderConnectivity.CredentialVault,
		private readonly clock: Clock,
	) {}

	async execute(cmd: ResolveProviderCredentialCommand): Promise<ResolvedCredential> {
		const orgId = cmd.organizationId as IdentityAccess.OrganizationId;
		const providerId = ProviderConnectivity.ProviderId.create(cmd.providerId);
		const now = this.clock.now();

		if (cmd.overrideCredentialId) {
			const explicit = await this.credentials.findById(
				cmd.overrideCredentialId as ProviderConnectivity.ProviderCredentialId,
			);
			if (!explicit || !explicit.isUsable(now)) {
				throw new NotFoundError(`Override credential ${cmd.overrideCredentialId} is missing or not usable`);
			}
			return await this.materialize(explicit);
		}

		const candidates = await this.credentials.listForProvider(orgId, providerId);
		const usable = candidates.filter((c) => c.isUsable(now));

		const score = (cred: ProviderConnectivity.ProviderCredential): number | null => {
			const scope = cred.scope;
			if (
				scope.type === ProviderConnectivity.CredentialScopeTypes.DOMAIN &&
				cmd.hints.domain &&
				scope.id === cmd.hints.domain
			) {
				return 4;
			}
			if (
				scope.type === ProviderConnectivity.CredentialScopeTypes.PROJECT &&
				cmd.hints.projectId &&
				scope.id === cmd.hints.projectId
			) {
				return 3;
			}
			if (
				scope.type === ProviderConnectivity.CredentialScopeTypes.PORTFOLIO &&
				cmd.hints.portfolioId &&
				scope.id === cmd.hints.portfolioId
			) {
				return 2;
			}
			if (scope.type === ProviderConnectivity.CredentialScopeTypes.ORG) {
				return 1;
			}
			return null;
		};

		let chosen: { cred: ProviderConnectivity.ProviderCredential; rank: number } | null = null;
		for (const cred of usable) {
			const rank = score(cred);
			if (rank === null) continue;
			if (!chosen || rank > chosen.rank || (rank === chosen.rank && cred.createdAt > chosen.cred.createdAt)) {
				chosen = { cred, rank };
			}
		}

		if (!chosen) {
			throw new NotFoundError(`No usable credential for provider ${providerId.value} in this scope`);
		}
		return await this.materialize(chosen.cred);
	}

	private async materialize(cred: ProviderConnectivity.ProviderCredential): Promise<ResolvedCredential> {
		const plaintext = await this.vault.decrypt(cred.encryptedSecret);
		return {
			credentialId: cred.id,
			scope: { type: cred.scope.type, id: cred.scope.id },
			plaintextSecret: plaintext,
		};
	}
}
