import { createHash } from 'node:crypto';
import { InvalidInputError } from '@rankpulse/shared';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import { RawPayloadStored } from '../events/raw-payload-stored.js';
import type { EndpointId } from '../value-objects/endpoint-id.js';
import type { RawPayloadId } from '../value-objects/identifiers.js';
import type { ProviderId } from '../value-objects/provider-id.js';

export interface RawPayloadProps {
	id: RawPayloadId;
	providerId: ProviderId;
	endpointId: EndpointId;
	requestHash: string;
	payload: unknown;
	payloadSize: number;
	fetchedAt: Date;
}

/**
 * Raw, untransformed response from a provider call. Persisted before any
 * normalization so that:
 *   - re-processing is possible if the normalizer changes,
 *   - debugging can replay the exact provider response,
 *   - the request_hash dedup key prevents double-billing the same call.
 */
export class RawPayload extends AggregateRoot {
	private constructor(private readonly props: RawPayloadProps) {
		super();
	}

	static store(input: {
		id: RawPayloadId;
		providerId: ProviderId;
		endpointId: EndpointId;
		params: Record<string, unknown>;
		dateBucket: string;
		payload: unknown;
		now: Date;
	}): RawPayload {
		const requestHash = computeRequestHash(
			input.providerId,
			input.endpointId,
			input.params,
			input.dateBucket,
		);
		const serialized = JSON.stringify(input.payload ?? null);
		if (serialized.length === 0) {
			throw new InvalidInputError('Raw payload cannot be empty');
		}
		const payload = new RawPayload({
			id: input.id,
			providerId: input.providerId,
			endpointId: input.endpointId,
			requestHash,
			payload: input.payload,
			payloadSize: Buffer.byteLength(serialized, 'utf8'),
			fetchedAt: input.now,
		});
		payload.record(
			new RawPayloadStored({
				rawPayloadId: input.id,
				providerId: input.providerId.value,
				endpointId: input.endpointId.value,
				requestHash,
				occurredAt: input.now,
			}),
		);
		return payload;
	}

	static rehydrate(props: RawPayloadProps): RawPayload {
		return new RawPayload(props);
	}

	get id(): RawPayloadId {
		return this.props.id;
	}
	get providerId(): ProviderId {
		return this.props.providerId;
	}
	get endpointId(): EndpointId {
		return this.props.endpointId;
	}
	get requestHash(): string {
		return this.props.requestHash;
	}
	get payload(): unknown {
		return this.props.payload;
	}
	get payloadSize(): number {
		return this.props.payloadSize;
	}
	get fetchedAt(): Date {
		return this.props.fetchedAt;
	}
}

const computeRequestHash = (
	providerId: ProviderId,
	endpointId: EndpointId,
	params: Record<string, unknown>,
	dateBucket: string,
): string => {
	const stable = stableStringify(params);
	const input = `${providerId.value}|${endpointId.value}|${stable}|${dateBucket}`;
	return createHash('sha256').update(input).digest('hex');
};

const stableStringify = (value: unknown): string => {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return JSON.stringify(value);
	const obj = value as Record<string, unknown>;
	const keys = Object.keys(obj).sort();
	return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
};

export const computeRequestHashFor = computeRequestHash;
