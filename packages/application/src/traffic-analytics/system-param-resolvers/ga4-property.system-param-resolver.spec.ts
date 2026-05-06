import type { TrafficAnalytics } from '@rankpulse/domain';
import { InvalidInputError, NotFoundError } from '@rankpulse/shared';
import { describe, expect, it, vi } from 'vitest';
import { Ga4PropertySystemParamResolver } from './ga4-property.system-param-resolver.js';

const projectId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const propertyId = 'pppppppp-pppp-pppp-pppp-pppppppppppp';
const propertyHandle = '460868003';

const aLinkedProperty = (): TrafficAnalytics.Ga4Property =>
	({ id: propertyId, isActive: () => true }) as unknown as TrafficAnalytics.Ga4Property;

describe('Ga4PropertySystemParamResolver', () => {
	it('returns ga4PropertyId when (project, propertyHandle) match an active property', async () => {
		const repo = {
			findByProjectAndHandle: vi.fn().mockResolvedValue(aLinkedProperty()),
		} as unknown as TrafficAnalytics.Ga4PropertyRepository;
		const resolver = new Ga4PropertySystemParamResolver(repo);
		const result = await resolver.resolve({
			projectId,
			providerId: 'google-analytics-4',
			endpointId: 'ga4-run-report',
			params: { propertyId: propertyHandle },
		});
		expect(result).toEqual({ ga4PropertyId: propertyId });
	});

	it('returns {} for non-GA4 endpoints (no-op)', async () => {
		const repo = { findByProjectAndHandle: vi.fn() } as unknown as TrafficAnalytics.Ga4PropertyRepository;
		const resolver = new Ga4PropertySystemParamResolver(repo);
		const result = await resolver.resolve({
			projectId,
			providerId: 'google-search-console',
			endpointId: 'gsc-search-analytics',
			params: { siteUrl: 'sc-domain:x' },
		});
		expect(result).toEqual({});
		expect(repo.findByProjectAndHandle).not.toHaveBeenCalled();
	});

	it('throws InvalidInputError when params.propertyId is missing', async () => {
		const repo = { findByProjectAndHandle: vi.fn() } as unknown as TrafficAnalytics.Ga4PropertyRepository;
		const resolver = new Ga4PropertySystemParamResolver(repo);
		await expect(
			resolver.resolve({
				projectId,
				providerId: 'google-analytics-4',
				endpointId: 'ga4-run-report',
				params: {},
			}),
		).rejects.toBeInstanceOf(InvalidInputError);
	});

	it('throws NotFoundError pointing the operator at /ga4/properties when not linked', async () => {
		const repo = {
			findByProjectAndHandle: vi.fn().mockResolvedValue(null),
		} as unknown as TrafficAnalytics.Ga4PropertyRepository;
		const resolver = new Ga4PropertySystemParamResolver(repo);
		await expect(
			resolver.resolve({
				projectId,
				providerId: 'google-analytics-4',
				endpointId: 'ga4-run-report',
				params: { propertyId: propertyHandle },
			}),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});
