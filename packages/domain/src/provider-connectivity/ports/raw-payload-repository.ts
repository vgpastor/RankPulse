import type { RawPayload } from '../entities/raw-payload.js';
import type { RawPayloadId } from '../value-objects/identifiers.js';

export interface RawPayloadRepository {
	/**
	 * Persist a payload and return the id under which this request's response
	 * is actually stored.
	 *
	 * One request hash, one row. When two runs fetch the same request at the
	 * same time, the second insert finds the hash taken and the row it loses
	 * is the earlier one. Returning that earlier id — rather than nothing — is
	 * what lets the caller point its run at data that exists instead of at an
	 * id that was never written. Callers must use the returned id, not the one
	 * they generated.
	 */
	save(payload: RawPayload): Promise<RawPayloadId>;
	findByRequestHash(requestHash: string): Promise<RawPayload | null>;
	findById(id: RawPayloadId): Promise<RawPayload | null>;
}
