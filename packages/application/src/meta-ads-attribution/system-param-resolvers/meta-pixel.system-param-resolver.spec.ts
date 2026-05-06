import type { MetaAdsAttribution } from '@rankpulse/domain';
import { InvalidInputError, NotFoundError } from '@rankpulse/shared';
import { describe, expect, it, vi } from 'vitest';
import { MetaPixelSystemParamResolver } from './meta-pixel.system-param-resolver.js';

const projectId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const pixelId = 'pppppppp-pppp-pppp-pppp-pppppppppppp';
const pixelHandle = '123456789012';

const aLinkedPixel = (): MetaAdsAttribution.MetaPixel =>
	({ id: pixelId, isActive: () => true }) as unknown as MetaAdsAttribution.MetaPixel;

describe('MetaPixelSystemParamResolver', () => {
	it('returns metaPixelId when (project, pixelHandle) match an active pixel', async () => {
		const repo = {
			findByProjectAndHandle: vi.fn().mockResolvedValue(aLinkedPixel()),
		} as unknown as MetaAdsAttribution.MetaPixelRepository;
		const resolver = new MetaPixelSystemParamResolver(repo);
		const result = await resolver.resolve({
			projectId,
			providerId: 'meta',
			endpointId: 'meta-pixel-events-stats',
			params: { pixelId: pixelHandle },
		});
		expect(result).toEqual({ metaPixelId: pixelId });
	});

	it('returns {} for non-meta endpoints (no-op)', async () => {
		const repo = {
			findByProjectAndHandle: vi.fn(),
		} as unknown as MetaAdsAttribution.MetaPixelRepository;
		const resolver = new MetaPixelSystemParamResolver(repo);
		const result = await resolver.resolve({
			projectId,
			providerId: 'google-analytics-4',
			endpointId: 'ga4-run-report',
			params: { propertyId: '12345' },
		});
		expect(result).toEqual({});
		expect(repo.findByProjectAndHandle).not.toHaveBeenCalled();
	});

	it('returns {} for meta-ads-insights (only meta-pixel-events-stats consumes pixelId)', async () => {
		const repo = {
			findByProjectAndHandle: vi.fn(),
		} as unknown as MetaAdsAttribution.MetaPixelRepository;
		const resolver = new MetaPixelSystemParamResolver(repo);
		const result = await resolver.resolve({
			projectId,
			providerId: 'meta',
			endpointId: 'meta-ads-insights',
			params: { adAccountId: 'act_99' },
		});
		expect(result).toEqual({});
		expect(repo.findByProjectAndHandle).not.toHaveBeenCalled();
	});

	it('throws InvalidInputError when params.pixelId is missing', async () => {
		const repo = {
			findByProjectAndHandle: vi.fn(),
		} as unknown as MetaAdsAttribution.MetaPixelRepository;
		const resolver = new MetaPixelSystemParamResolver(repo);
		await expect(
			resolver.resolve({
				projectId,
				providerId: 'meta',
				endpointId: 'meta-pixel-events-stats',
				params: {},
			}),
		).rejects.toBeInstanceOf(InvalidInputError);
	});

	it('throws NotFoundError pointing the operator at /meta/pixels when not linked', async () => {
		const repo = {
			findByProjectAndHandle: vi.fn().mockResolvedValue(null),
		} as unknown as MetaAdsAttribution.MetaPixelRepository;
		const resolver = new MetaPixelSystemParamResolver(repo);
		await expect(
			resolver.resolve({
				projectId,
				providerId: 'meta',
				endpointId: 'meta-pixel-events-stats',
				params: { pixelId: pixelHandle },
			}),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});
