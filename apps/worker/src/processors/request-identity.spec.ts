import { ProviderConnectivity } from '@rankpulse/domain';
import type { EndpointDescriptor } from '@rankpulse/provider-core';
import { serpGoogleOrganicLiveDescriptor } from '@rankpulse/provider-dataforseo';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { deriveRequestIdentity } from './request-identity.js';

const PROVIDER_ID = ProviderConnectivity.ProviderId.create('dataforseo');
const ENDPOINT_ID = ProviderConnectivity.EndpointId.create('serp-google-organic-live');
const DATE_BUCKET = '2026-09-17';

const silentLog = () => ({ warn: vi.fn() });

/** Params as they are actually persisted on a fan-out job definition. */
const definitionParams = (overrides: Record<string, unknown>) => ({
	keyword: 'software control de rondas',
	phrase: 'software control de rondas',
	locationCode: 2724,
	languageCode: 'es',
	language: 'es',
	country: 'ES',
	device: 'desktop',
	depth: 100,
	projectId: '86bba537-7fbb-472d-81d9-17e9581440fa',
	organizationId: 'ebc15d3c-8698-4100-b7e4-f4d8db3a614e',
	...overrides,
});

const hashOf = (params: Record<string, unknown>) =>
	ProviderConnectivity.computeRequestHashFor(PROVIDER_ID, ENDPOINT_ID, params, DATE_BUCKET);

describe('deriveRequestIdentity', () => {
	it('keeps only the params the provider body is built from', () => {
		const identity = deriveRequestIdentity(
			serpGoogleOrganicLiveDescriptor,
			definitionParams({ domain: 'patroltech.online', trackedKeywordId: 'kw-1' }),
			silentLog(),
		);

		expect(identity).toEqual({
			keyword: 'software control de rondas',
			locationCode: 2724,
			languageCode: 'es',
			device: 'desktop',
			depth: 100,
		});
	});

	it('gives fan-out siblings the same hash so only the first call is billed', () => {
		// The 8 definitions behind `software control de rondas` differ only in
		// which domain's position they extract — the POST body is identical.
		const siblings = [
			{ domain: 'patroltech.online', trackedKeywordId: 'kw-1' },
			{ domain: 'softwarerondas.com', trackedKeywordId: 'kw-2' },
			{ domain: 'controlderondas.es', trackedKeywordId: 'kw-3' },
			{ domain: 'rondasoffline.com', trackedKeywordId: 'kw-4' },
			{ domain: 'comparadordecontrolrondas.com', trackedKeywordId: 'kw-5' },
		];

		const hashes = siblings.map((s) =>
			hashOf(deriveRequestIdentity(serpGoogleOrganicLiveDescriptor, definitionParams(s), silentLog())),
		);

		expect(new Set(hashes).size).toBe(1);
	});

	it('regression: hashing raw params gave every sibling its own hash', () => {
		const raw = [
			definitionParams({ domain: 'patroltech.online', trackedKeywordId: 'kw-1' }),
			definitionParams({ domain: 'softwarerondas.com', trackedKeywordId: 'kw-2' }),
		].map(hashOf);

		expect(new Set(raw).size).toBe(2);
	});

	it('normalizes an omitted default against an explicit one', () => {
		const explicit = definitionParams({ device: 'desktop', depth: 100 });
		// `device` and `depth` carry `.default()` in the schema, so a definition
		// that omits them must hash the same as one that states them.
		const { device: _device, depth: _depth, ...omitted } = definitionParams({});

		const a = hashOf(deriveRequestIdentity(serpGoogleOrganicLiveDescriptor, explicit, silentLog()));
		const b = hashOf(deriveRequestIdentity(serpGoogleOrganicLiveDescriptor, omitted, silentLog()));

		expect(a).toBe(b);
	});

	it('still separates requests that differ in a real param', () => {
		const desktop = definitionParams({ device: 'desktop' });
		const mobile = definitionParams({ device: 'mobile' });
		const otherCountry = definitionParams({ locationCode: 2484 });

		const hashes = [desktop, mobile, otherCountry].map((p) =>
			hashOf(deriveRequestIdentity(serpGoogleOrganicLiveDescriptor, p, silentLog())),
		);

		expect(new Set(hashes).size).toBe(3);
	});

	it('falls back to raw params and warns when they do not satisfy the schema', () => {
		const log = silentLog();
		const broken = { keyword: 'control de rondas' }; // missing locationCode/languageCode

		const identity = deriveRequestIdentity(serpGoogleOrganicLiveDescriptor, broken, log);

		expect(identity).toBe(broken);
		expect(log.warn).toHaveBeenCalledOnce();
	});

	it('refuses to dedup when the schema strips every param', () => {
		// An all-optional schema would collapse populated params to `{}` and
		// give every call the same hash — each one served the first response.
		const log = silentLog();
		const allOptional = {
			...serpGoogleOrganicLiveDescriptor,
			paramsSchema: z.object({ nothingWeSend: z.string().optional() }),
		} as EndpointDescriptor;

		const identity = deriveRequestIdentity(allOptional, definitionParams({}), log);

		expect(identity).not.toEqual({});
		expect(log.warn).toHaveBeenCalledOnce();
	});

	it('works for any endpoint without the descriptor opting in', () => {
		// OCP: a new endpoint gets dedup from its paramsSchema alone.
		const descriptor = {
			...serpGoogleOrganicLiveDescriptor,
			id: 'some-future-endpoint',
		} as EndpointDescriptor;

		const identity = deriveRequestIdentity(
			descriptor,
			definitionParams({ domain: 'guardtour.app' }),
			silentLog(),
		);

		expect(identity).not.toHaveProperty('domain');
	});
});
