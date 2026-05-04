import type { IdentityAccess, ProviderConnectivity } from '@rankpulse/domain';
import { and, between, eq, sql } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { apiUsageEntries } from '../../schema/index.js';

const CENTS_PRECISION = 1_000_000n;
const toMillicents = (cents: number): bigint => BigInt(Math.round(cents * Number(CENTS_PRECISION)));
const fromMillicents = (millicents: bigint): number => Number(millicents) / Number(CENTS_PRECISION);

export class DrizzleApiUsageRepository implements ProviderConnectivity.ApiUsageRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(entry: ProviderConnectivity.ApiUsageEntry): Promise<void> {
		await this.db.insert(apiUsageEntries).values({
			id: entry.id,
			organizationId: entry.organizationId,
			credentialId: entry.credentialId,
			projectId: entry.projectId,
			providerId: entry.providerId.value,
			endpointId: entry.endpointId.value,
			calls: entry.calls,
			costMillicents: toMillicents(entry.cost.cents),
			occurredAt: entry.occurredAt,
		});
	}

	async sumCostCents(orgId: IdentityAccess.OrganizationId, from: Date, to: Date): Promise<number> {
		const [row] = await this.db
			.select({ total: sql<string>`COALESCE(SUM(${apiUsageEntries.costMillicents}), 0)` })
			.from(apiUsageEntries)
			.where(and(eq(apiUsageEntries.organizationId, orgId), between(apiUsageEntries.occurredAt, from, to)));
		const millicents = row?.total ? BigInt(row.total) : 0n;
		return fromMillicents(millicents);
	}
}
