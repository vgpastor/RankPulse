import { ProviderConnectivity } from '@rankpulse/domain';
import { eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { rawPayloads } from '../../schema/index.js';

export class DrizzleRawPayloadRepository implements ProviderConnectivity.RawPayloadRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(payload: ProviderConnectivity.RawPayload): Promise<ProviderConnectivity.RawPayloadId> {
		const inserted = await this.db
			.insert(rawPayloads)
			.values({
				id: payload.id,
				providerId: payload.providerId.value,
				endpointId: payload.endpointId.value,
				requestHash: payload.requestHash,
				requestParams: payload.requestParams,
				payload: payload.payload as Record<string, unknown>,
				payloadSize: payload.payloadSize,
				fetchedAt: payload.fetchedAt,
			})
			.onConflictDoNothing({ target: rawPayloads.requestHash })
			.returning({ id: rawPayloads.id });
		if (inserted[0]) return inserted[0].id as ProviderConnectivity.RawPayloadId;

		// Lost the race: another run stored this request first. Its row is the
		// one that exists, so its id is the one to hand back. Swallowing the
		// conflict and returning nothing is how 337 runs ended up pointing at
		// payload ids that were never written.
		const [existing] = await this.db
			.select({ id: rawPayloads.id })
			.from(rawPayloads)
			.where(eq(rawPayloads.requestHash, payload.requestHash))
			.limit(1);
		if (!existing) {
			throw new Error(`raw payload ${payload.requestHash} neither inserted nor found`);
		}
		return existing.id as ProviderConnectivity.RawPayloadId;
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
			requestParams: row.requestParams,
			payload: row.payload,
			payloadSize: row.payloadSize,
			fetchedAt: row.fetchedAt,
		});
	}
}
