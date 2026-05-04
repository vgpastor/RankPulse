import type { ApiToken } from '../entities/api-token.js';
import type { ApiTokenId, OrganizationId } from '../value-objects/identifiers.js';

export interface ApiTokenRepository {
	save(token: ApiToken): Promise<void>;
	findById(id: ApiTokenId): Promise<ApiToken | null>;
	findByHashedToken(hashedToken: string): Promise<ApiToken | null>;
	listForOrganization(orgId: OrganizationId): Promise<readonly ApiToken[]>;
}
