import type { BingWebmasterInsights } from '@rankpulse/domain';
import { InvalidInputError, NotFoundError } from '@rankpulse/shared';
import { describe, expect, it, vi } from 'vitest';
import { BingPropertySystemParamResolver } from './bing-property.system-param-resolver.js';

const projectId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const propId = 'pppppppp-pppp-pppp-pppp-pppppppppppp';
const siteUrl = 'https://example.com';

const aLinkedProperty = (): BingWebmasterInsights.BingProperty =>
	({ id: propId, isActive: () => true }) as unknown as BingWebmasterInsights.BingProperty;

describe('BingPropertySystemParamResolver', () => {
	it('returns bingPropertyId on a match', async () => {
		const repo = {
			findByProjectAndSite: vi.fn().mockResolvedValue(aLinkedProperty()),
		} as unknown as BingWebmasterInsights.BingPropertyRepository;
		const r = new BingPropertySystemParamResolver(repo);
		const out = await r.resolve({
			projectId,
			providerId: 'bing-webmaster',
			endpointId: 'bing-rank-and-traffic-stats',
			params: { siteUrl },
		});
		expect(out).toEqual({ bingPropertyId: propId });
	});

	it('returns {} for other providers', async () => {
		const repo = { findByProjectAndSite: vi.fn() } as unknown as BingWebmasterInsights.BingPropertyRepository;
		const r = new BingPropertySystemParamResolver(repo);
		expect(await r.resolve({ projectId, providerId: 'dataforseo', endpointId: 'serp', params: {} })).toEqual(
			{},
		);
	});

	it('throws InvalidInputError when siteUrl missing', async () => {
		const repo = { findByProjectAndSite: vi.fn() } as unknown as BingWebmasterInsights.BingPropertyRepository;
		const r = new BingPropertySystemParamResolver(repo);
		await expect(
			r.resolve({
				projectId,
				providerId: 'bing-webmaster',
				endpointId: 'bing-rank-and-traffic-stats',
				params: {},
			}),
		).rejects.toBeInstanceOf(InvalidInputError);
	});

	it('throws NotFoundError when not linked', async () => {
		const repo = {
			findByProjectAndSite: vi.fn().mockResolvedValue(null),
		} as unknown as BingWebmasterInsights.BingPropertyRepository;
		const r = new BingPropertySystemParamResolver(repo);
		await expect(
			r.resolve({
				projectId,
				providerId: 'bing-webmaster',
				endpointId: 'bing-rank-and-traffic-stats',
				params: { siteUrl },
			}),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});
