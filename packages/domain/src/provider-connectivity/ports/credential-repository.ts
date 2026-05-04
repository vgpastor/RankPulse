import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProviderCredential } from '../entities/provider-credential.js';
import type { CredentialScope } from '../value-objects/credential-scope.js';
import type { ProviderCredentialId } from '../value-objects/identifiers.js';
import type { ProviderId } from '../value-objects/provider-id.js';

export interface CredentialRepository {
	save(credential: ProviderCredential): Promise<void>;
	findById(id: ProviderCredentialId): Promise<ProviderCredential | null>;
	/** All active credentials in an org for a given provider, across all scopes. */
	listForProvider(orgId: OrganizationId, providerId: ProviderId): Promise<readonly ProviderCredential[]>;
	/** Find one credential matching exactly the given scope (used for uniqueness checks). */
	findByScope(
		orgId: OrganizationId,
		providerId: ProviderId,
		scope: CredentialScope,
		label: string,
	): Promise<ProviderCredential | null>;
}
