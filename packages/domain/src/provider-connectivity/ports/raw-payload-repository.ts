import type { RawPayload } from '../entities/raw-payload.js';
import type { RawPayloadId } from '../value-objects/identifiers.js';

export interface RawPayloadRepository {
	save(payload: RawPayload): Promise<void>;
	findByRequestHash(requestHash: string): Promise<RawPayload | null>;
	findById(id: RawPayloadId): Promise<RawPayload | null>;
}
