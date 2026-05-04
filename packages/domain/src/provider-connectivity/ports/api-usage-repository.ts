import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ApiUsageEntry } from '../entities/api-usage-entry.js';

export interface ApiUsageRepository {
	save(entry: ApiUsageEntry): Promise<void>;
	/** Sum cost cents for an organization in [from, to). */
	sumCostCents(orgId: OrganizationId, from: Date, to: Date): Promise<number>;
}
