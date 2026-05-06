import type { MetaAdsAttribution } from '@rankpulse/domain';
import { InvalidInputError, NotFoundError } from '@rankpulse/shared';
import { describe, expect, it, vi } from 'vitest';
import { MetaAdAccountSystemParamResolver } from './meta-ad-account.system-param-resolver.js';

const projectId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const accountId = 'oooooooo-oooo-oooo-oooo-oooooooooooo';
const adAccountHandle = '987654321';

const aLinkedAccount = (): MetaAdsAttribution.MetaAdAccount =>
	({ id: accountId, isActive: () => true }) as unknown as MetaAdsAttribution.MetaAdAccount;

describe('MetaAdAccountSystemParamResolver', () => {
	it('returns metaAdAccountId for meta-ads-insights when account is linked', async () => {
		const repo = {
			findByProjectAndHandle: vi.fn().mockResolvedValue(aLinkedAccount()),
		} as unknown as MetaAdsAttribution.MetaAdAccountRepository;
		const resolver = new MetaAdAccountSystemParamResolver(repo);
		const result = await resolver.resolve({
			projectId,
			providerId: 'meta',
			endpointId: 'meta-ads-insights',
			params: { adAccountId: adAccountHandle },
		});
		expect(result).toEqual({ metaAdAccountId: accountId });
	});

	it('also resolves for meta-custom-audiences (same account scoping)', async () => {
		const repo = {
			findByProjectAndHandle: vi.fn().mockResolvedValue(aLinkedAccount()),
		} as unknown as MetaAdsAttribution.MetaAdAccountRepository;
		const resolver = new MetaAdAccountSystemParamResolver(repo);
		const result = await resolver.resolve({
			projectId,
			providerId: 'meta',
			endpointId: 'meta-custom-audiences',
			params: { adAccountId: `act_${adAccountHandle}` },
		});
		expect(result).toEqual({ metaAdAccountId: accountId });
	});

	it('returns {} for non-meta providers (no-op)', async () => {
		const repo = {
			findByProjectAndHandle: vi.fn(),
		} as unknown as MetaAdsAttribution.MetaAdAccountRepository;
		const resolver = new MetaAdAccountSystemParamResolver(repo);
		const result = await resolver.resolve({
			projectId,
			providerId: 'google-analytics-4',
			endpointId: 'ga4-run-report',
			params: { propertyId: '12345' },
		});
		expect(result).toEqual({});
		expect(repo.findByProjectAndHandle).not.toHaveBeenCalled();
	});

	it('returns {} for meta-pixel-events-stats (the pixel resolver handles that one)', async () => {
		const repo = {
			findByProjectAndHandle: vi.fn(),
		} as unknown as MetaAdsAttribution.MetaAdAccountRepository;
		const resolver = new MetaAdAccountSystemParamResolver(repo);
		const result = await resolver.resolve({
			projectId,
			providerId: 'meta',
			endpointId: 'meta-pixel-events-stats',
			params: { pixelId: '12345678' },
		});
		expect(result).toEqual({});
		expect(repo.findByProjectAndHandle).not.toHaveBeenCalled();
	});

	it('throws InvalidInputError when params.adAccountId is missing', async () => {
		const repo = {
			findByProjectAndHandle: vi.fn(),
		} as unknown as MetaAdsAttribution.MetaAdAccountRepository;
		const resolver = new MetaAdAccountSystemParamResolver(repo);
		await expect(
			resolver.resolve({
				projectId,
				providerId: 'meta',
				endpointId: 'meta-ads-insights',
				params: {},
			}),
		).rejects.toBeInstanceOf(InvalidInputError);
	});

	it('throws NotFoundError when the ad account is not linked', async () => {
		const repo = {
			findByProjectAndHandle: vi.fn().mockResolvedValue(null),
		} as unknown as MetaAdsAttribution.MetaAdAccountRepository;
		const resolver = new MetaAdAccountSystemParamResolver(repo);
		await expect(
			resolver.resolve({
				projectId,
				providerId: 'meta',
				endpointId: 'meta-ads-insights',
				params: { adAccountId: adAccountHandle },
			}),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});
