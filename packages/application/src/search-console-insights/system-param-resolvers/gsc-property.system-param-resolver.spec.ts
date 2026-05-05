import type { SearchConsoleInsights } from '@rankpulse/domain';
import { InvalidInputError, NotFoundError } from '@rankpulse/shared';
import { describe, expect, it, vi } from 'vitest';
import { GscPropertySystemParamResolver } from './gsc-property.system-param-resolver.js';

const projectId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const propertyId = 'pppppppp-pppp-pppp-pppp-pppppppppppp';
const siteUrl = 'sc-domain:example.com';

const aLinkedProperty = (): SearchConsoleInsights.GscProperty =>
	({
		id: propertyId,
		isActive: () => true,
	}) as unknown as SearchConsoleInsights.GscProperty;

const anUnlinkedProperty = (): SearchConsoleInsights.GscProperty =>
	({
		id: propertyId,
		isActive: () => false,
	}) as unknown as SearchConsoleInsights.GscProperty;

describe('GscPropertySystemParamResolver', () => {
	it('returns gscPropertyId when (project, siteUrl) match an active property', async () => {
		const repo = {
			findByProjectAndSite: vi.fn().mockResolvedValue(aLinkedProperty()),
		} as unknown as SearchConsoleInsights.GscPropertyRepository;
		const resolver = new GscPropertySystemParamResolver(repo);

		const result = await resolver.resolve({
			projectId,
			providerId: 'google-search-console',
			endpointId: 'gsc-search-analytics',
			params: { siteUrl },
		});

		expect(result).toEqual({ gscPropertyId: propertyId });
		expect(repo.findByProjectAndSite).toHaveBeenCalledWith(projectId, siteUrl);
	});

	it('returns empty object when the request is for a different provider', async () => {
		const repo = {
			findByProjectAndSite: vi.fn(),
		} as unknown as SearchConsoleInsights.GscPropertyRepository;
		const resolver = new GscPropertySystemParamResolver(repo);

		const result = await resolver.resolve({
			projectId,
			providerId: 'dataforseo',
			endpointId: 'serp-google-organic-live',
			params: { siteUrl },
		});

		expect(result).toEqual({});
		expect(repo.findByProjectAndSite).not.toHaveBeenCalled();
	});

	it('returns empty object for other GSC endpoints', async () => {
		const repo = {
			findByProjectAndSite: vi.fn(),
		} as unknown as SearchConsoleInsights.GscPropertyRepository;
		const resolver = new GscPropertySystemParamResolver(repo);

		const result = await resolver.resolve({
			projectId,
			providerId: 'google-search-console',
			endpointId: 'gsc-other-future-endpoint',
			params: { siteUrl },
		});

		expect(result).toEqual({});
	});

	it('throws InvalidInputError when params.siteUrl is missing', async () => {
		const repo = {
			findByProjectAndSite: vi.fn(),
		} as unknown as SearchConsoleInsights.GscPropertyRepository;
		const resolver = new GscPropertySystemParamResolver(repo);

		await expect(
			resolver.resolve({
				projectId,
				providerId: 'google-search-console',
				endpointId: 'gsc-search-analytics',
				params: {},
			}),
		).rejects.toBeInstanceOf(InvalidInputError);
	});

	it('throws NotFoundError pointing the operator at /gsc/properties when the property is not linked', async () => {
		const repo = {
			findByProjectAndSite: vi.fn().mockResolvedValue(null),
		} as unknown as SearchConsoleInsights.GscPropertyRepository;
		const resolver = new GscPropertySystemParamResolver(repo);

		const promise = resolver.resolve({
			projectId,
			providerId: 'google-search-console',
			endpointId: 'gsc-search-analytics',
			params: { siteUrl },
		});

		await expect(promise).rejects.toBeInstanceOf(NotFoundError);
		await expect(promise).rejects.toThrow(/POST \/gsc\/properties/);
	});

	it('throws NotFoundError when the property exists but was unlinked', async () => {
		const repo = {
			findByProjectAndSite: vi.fn().mockResolvedValue(anUnlinkedProperty()),
		} as unknown as SearchConsoleInsights.GscPropertyRepository;
		const resolver = new GscPropertySystemParamResolver(repo);

		await expect(
			resolver.resolve({
				projectId,
				providerId: 'google-search-console',
				endpointId: 'gsc-search-analytics',
				params: { siteUrl },
			}),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});
