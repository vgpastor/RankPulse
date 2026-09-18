import type { Uuid } from '@rankpulse/shared';
import { describe, expect, it } from 'vitest';
import { EndpointId } from '../value-objects/endpoint-id.js';
import type { RawPayloadId } from '../value-objects/identifiers.js';
import { ProviderId } from '../value-objects/provider-id.js';
import { RawPayload, computeRequestHashFor } from './raw-payload.js';

const providerId = ProviderId.create('dataforseo');
const endpointId = EndpointId.create('serp-google-organic-live');
const DATE_BUCKET = '2026-09-18';

// What actually travels upstream for a SERP check.
const identity = { keyword: 'control de rondas', locationCode: 2724, languageCode: 'es', device: 'desktop', depth: 100 };

const store = (params: Record<string, unknown>) =>
	RawPayload.store({
		id: '00000000-0000-0000-0000-000000000001' as Uuid as RawPayloadId,
		providerId,
		endpointId,
		params,
		dateBucket: DATE_BUCKET,
		payload: { tasks: [] },
		now: new Date('2026-09-18T04:13:00Z'),
	});

describe('RawPayload.store', () => {
	it('records the hash of exactly the params it is handed', () => {
		expect(store(identity).requestHash).toBe(
			computeRequestHashFor(providerId, endpointId, identity, DATE_BUCKET),
		);
	});

	it('keeps those params alongside the hash, so a reader can see what was asked', () => {
		expect(store(identity).requestParams).toEqual(identity);
	});

	// The processor looks a payload up by the hash of the request identity and
	// then stores it through this factory. If it hands the factory the wider
	// definition params instead — `domain`, `trackedKeywordId`, the keys that
	// never reach the provider — the stored hash no longer matches the lookup
	// hash and every sibling definition fetches again. That is what happened
	// in production between #215 and this fix: three definitions for one
	// upstream request, three payloads, three bills.
	it('yields a different hash when handed bookkeeping keys, so callers must pass the identity', () => {
		const widened = { ...identity, domain: 'controlderondas.es', trackedKeywordId: 'tk-1', projectId: 'p-1' };
		expect(store(widened).requestHash).not.toBe(store(identity).requestHash);
	});

	it('is insensitive to key order', () => {
		const reordered = { depth: 100, device: 'desktop', languageCode: 'es', locationCode: 2724, keyword: 'control de rondas' };
		expect(store(reordered).requestHash).toBe(store(identity).requestHash);
	});
});
