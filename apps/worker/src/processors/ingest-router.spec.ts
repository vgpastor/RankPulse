import type { Core as ApplicationCore } from '@rankpulse/application';
import type { IngestBinding, ProviderManifest } from '@rankpulse/provider-core';
import { NotFoundError } from '@rankpulse/shared';
import { describe, expect, it, vi } from 'vitest';
import { buildIngestRouter, IngestRouter, type IngestRouterEntry } from './ingest-router.js';

type IngestUseCase = ApplicationCore.IngestUseCase;
// Tests need the same `${string}|${string}` template-literal Map key the
// router uses; a plain string-keyed Map is structurally incompatible.
type RouterKey = `${string}|${string}`;

const buildEntry = (overrides: Partial<{ acl: () => unknown[]; execute: () => Promise<void> }> = {}) => {
	const acl = overrides.acl ?? vi.fn().mockReturnValue([{ row: 1 }]);
	const execute = overrides.execute ?? vi.fn().mockResolvedValue(undefined);
	const ingest: IngestUseCase = { execute };
	return { acl, execute, ingest };
};

describe('IngestRouter.dispatch', () => {
	it('happy path: looks up entry, runs ACL, calls ingest with rows + systemParams', async () => {
		const { acl, execute, ingest } = buildEntry();
		const entries = new Map<RouterKey, IngestRouterEntry>([
			['fake|fake-endpoint', { systemParamKey: 'fakeId', acl, ingest }],
		]);
		const router = new IngestRouter(entries);

		const handled = await router.dispatch({
			providerId: 'fake',
			endpointId: 'fake-endpoint',
			fetchResult: { ok: true },
			rawPayloadId: 'rp-1',
			definition: { params: { fakeId: 'entity-1', siteUrl: 'x' } } as never,
			dateBucket: '2026-05-06',
		});

		expect(handled).toBe(true);
		expect(acl).toHaveBeenCalledWith(
			{ ok: true },
			expect.objectContaining({
				dateBucket: '2026-05-06',
				systemParams: { fakeId: 'entity-1', siteUrl: 'x' },
			}),
		);
		expect(execute).toHaveBeenCalledWith({
			rawPayloadId: 'rp-1',
			rows: [{ row: 1 }],
			systemParams: { fakeId: 'entity-1', siteUrl: 'x' },
		});
	});

	it('returns false when (provider, endpoint) is not registered (raw-only / legacy fallback)', async () => {
		const router = new IngestRouter(new Map());
		await expect(
			router.dispatch({
				providerId: 'unknown',
				endpointId: 'unknown',
				fetchResult: {},
				rawPayloadId: 'rp-1',
				definition: { params: {} } as never,
				dateBucket: '2026-05-06',
			}),
		).resolves.toBe(false);
	});

	it('has() returns true for registered tuples and false otherwise', () => {
		const { acl, ingest } = buildEntry();
		const entries = new Map<RouterKey, IngestRouterEntry>([
			['fake|fake-endpoint', { systemParamKey: 'fakeId', acl, ingest }],
		]);
		const router = new IngestRouter(entries);
		expect(router.has('fake', 'fake-endpoint')).toBe(true);
		expect(router.has('fake', 'other')).toBe(false);
		expect(router.has('other', 'fake-endpoint')).toBe(false);
	});

	it('throws NotFoundError when systemParam is missing', async () => {
		const { acl, ingest } = buildEntry();
		const entries = new Map<RouterKey, IngestRouterEntry>([
			['fake|fake-endpoint', { systemParamKey: 'fakeId', acl, ingest }],
		]);
		const router = new IngestRouter(entries);

		await expect(
			router.dispatch({
				providerId: 'fake',
				endpointId: 'fake-endpoint',
				fetchResult: {},
				rawPayloadId: 'rp-1',
				definition: { params: {} } as never,
				dateBucket: '2026-05-06',
			}),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});

describe('buildIngestRouter', () => {
	it('builds entries from manifest endpoints with ingest bindings', () => {
		const aclA = vi.fn();
		const aclB = vi.fn();
		const ingestA: IngestUseCase = { execute: vi.fn().mockResolvedValue(undefined) };
		const ingestB: IngestUseCase = { execute: vi.fn().mockResolvedValue(undefined) };
		const manifests: ProviderManifest[] = [
			{
				id: 'p1',
				displayName: 'P1',
				http: { baseUrl: 'http://x', auth: { kind: 'bearer-token' } },
				validateCredentialPlaintext: () => {},
				endpoints: [
					{
						descriptor: { id: 'e-a' } as never,
						fetch: async () => ({}),
						ingest: { useCaseKey: 'p1:a', systemParamKey: 'aId', acl: aclA },
					},
					{
						descriptor: { id: 'e-b' } as never,
						fetch: async () => ({}),
						ingest: { useCaseKey: 'p1:b', systemParamKey: 'bId', acl: aclB },
					},
					{
						descriptor: { id: 'e-c' } as never,
						fetch: async () => ({}),
						ingest: null, // raw-only
					},
				],
			},
		];
		const router = buildIngestRouter(manifests, { 'p1:a': ingestA, 'p1:b': ingestB });
		expect(router).toBeInstanceOf(IngestRouter);
	});

	it('throws when an IngestBinding references a useCaseKey not in the registrations', () => {
		const manifests: ProviderManifest[] = [
			{
				id: 'p1',
				displayName: 'P1',
				http: { baseUrl: 'http://x', auth: { kind: 'bearer-token' } },
				validateCredentialPlaintext: () => {},
				endpoints: [
					{
						descriptor: { id: 'e-x' } as never,
						fetch: async () => ({}),
						ingest: {
							useCaseKey: 'p1:missing',
							systemParamKey: 'eId',
							acl: () => [],
						} satisfies IngestBinding,
					},
				],
			},
		];
		expect(() => buildIngestRouter(manifests, {})).toThrow(
			/no IngestUseCase registered for key 'p1:missing'/,
		);
	});
});
