import type { WebPerformance } from '@rankpulse/domain';
import { InvalidInputError, NotFoundError } from '@rankpulse/shared';
import { describe, expect, it, vi } from 'vitest';
import { TrackedPageSystemParamResolver } from './tracked-page.system-param-resolver.js';

const projectId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const pageId = 'pppppppp-pppp-pppp-pppp-pppppppppppp';
const url = 'https://example.com';

const aTrackedPage = (): WebPerformance.TrackedPage =>
	({ id: pageId }) as unknown as WebPerformance.TrackedPage;

describe('TrackedPageSystemParamResolver', () => {
	it('returns trackedPageId on tuple match', async () => {
		const repo = {
			findByTuple: vi.fn().mockResolvedValue(aTrackedPage()),
		} as unknown as WebPerformance.TrackedPageRepository;
		const r = new TrackedPageSystemParamResolver(repo);
		const out = await r.resolve({
			projectId,
			providerId: 'pagespeed',
			endpointId: 'psi-runpagespeed',
			params: { url, strategy: 'mobile' },
		});
		expect(out).toEqual({ trackedPageId: pageId });
	});

	it('returns {} for other providers', async () => {
		const repo = { findByTuple: vi.fn() } as unknown as WebPerformance.TrackedPageRepository;
		const r = new TrackedPageSystemParamResolver(repo);
		expect(await r.resolve({ projectId, providerId: 'dataforseo', endpointId: 'serp', params: {} })).toEqual(
			{},
		);
	});

	it('throws InvalidInputError on missing url or invalid strategy', async () => {
		const repo = { findByTuple: vi.fn() } as unknown as WebPerformance.TrackedPageRepository;
		const r = new TrackedPageSystemParamResolver(repo);
		await expect(
			r.resolve({
				projectId,
				providerId: 'pagespeed',
				endpointId: 'psi-runpagespeed',
				params: { url, strategy: 'not-real' },
			}),
		).rejects.toBeInstanceOf(InvalidInputError);
	});

	it('throws NotFoundError when page not tracked', async () => {
		const repo = {
			findByTuple: vi.fn().mockResolvedValue(null),
		} as unknown as WebPerformance.TrackedPageRepository;
		const r = new TrackedPageSystemParamResolver(repo);
		await expect(
			r.resolve({
				projectId,
				providerId: 'pagespeed',
				endpointId: 'psi-runpagespeed',
				params: { url, strategy: 'mobile' },
			}),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});
