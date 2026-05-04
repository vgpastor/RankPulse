import { ProviderConnectivity } from '@rankpulse/domain';
import { eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { rawPayloads } from '../../schema/index.js';

export class DrizzleRawPayloadRepository implements ProviderConnectivity.RawPayloadRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(payload: ProviderConnectivity.RawPayload): Promise<void> {
		await this.db
			.insert(rawPayloads)
			.values({
				id: payload.id,
				providerId: payload.providerId.value,
				endpointId: payload.endpointId.value,
				requestHash: payload.requestHash,
				payload: payload.payload as Record<string, unknown>,
				payloadSize: payload.payloadSize,
				fetchedAt: payload.fetchedAt,
			})
			.onConflictDoNothing({ target: rawPayloads.requestHash });
	}

	async findByRequestHash(requestHash: string): Promise<ProviderConnectivity.RawPayload | null> {
		const [row] = await this.db
			.select()
			.from(rawPayloads)
			.where(eq(rawPayloads.requestHash, requestHash))
			.limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async findById(id: ProviderConnectivity.RawPayloadId): Promise<ProviderConnectivity.RawPayload | null> {
		const [row] = await this.db.select().from(rawPayloads).where(eq(rawPayloads.id, id)).limit(1);
		return row ? this.toAggregate(row) : null;
	}

	private toAggregate(row: typeof rawPayloads.$inferSelect): ProviderConnectivity.RawPayload {
		return ProviderConnectivity.RawPayload.rehydrate({
			id: row.id as ProviderConnectivity.RawPayloadId,
			providerId: ProviderConnectivity.ProviderId.create(row.providerId),
			endpointId: ProviderConnectivity.EndpointId.create(row.endpointId),
			requestHash: row.requestHash,
			payload: row.payload,
			payloadSize: row.payloadSize,
			fetchedAt: row.fetchedAt,
		});
	}
}
