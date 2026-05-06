import type { MacroContext } from '@rankpulse/domain';
import { InvalidInputError, NotFoundError } from '@rankpulse/shared';
import { describe, expect, it, vi } from 'vitest';
import { MonitoredDomainSystemParamResolver } from './monitored-domain.system-param-resolver.js';

const projectId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const monitoredDomainId = 'mmmmmmmm-mmmm-mmmm-mmmm-mmmmmmmmmmmm';
const domain = 'patroltech.online';

const aLinked = (): MacroContext.MonitoredDomain =>
	({ id: monitoredDomainId, isActive: () => true }) as unknown as MacroContext.MonitoredDomain;

describe('MonitoredDomainSystemParamResolver', () => {
	it('returns monitoredDomainId on a match', async () => {
		const repo = {
			findByProjectAndDomain: vi.fn().mockResolvedValue(aLinked()),
		} as unknown as MacroContext.MonitoredDomainRepository;
		const r = new MonitoredDomainSystemParamResolver(repo);
		const out = await r.resolve({
			projectId,
			providerId: 'cloudflare-radar',
			endpointId: 'radar-domain-rank',
			params: { domain },
		});
		expect(out).toEqual({ monitoredDomainId });
	});

	it('returns {} for other providers', async () => {
		const repo = { findByProjectAndDomain: vi.fn() } as unknown as MacroContext.MonitoredDomainRepository;
		const r = new MonitoredDomainSystemParamResolver(repo);
		expect(await r.resolve({ projectId, providerId: 'dataforseo', endpointId: 'serp', params: {} })).toEqual(
			{},
		);
	});

	it('throws InvalidInputError on missing domain', async () => {
		const repo = { findByProjectAndDomain: vi.fn() } as unknown as MacroContext.MonitoredDomainRepository;
		const r = new MonitoredDomainSystemParamResolver(repo);
		await expect(
			r.resolve({ projectId, providerId: 'cloudflare-radar', endpointId: 'radar-domain-rank', params: {} }),
		).rejects.toBeInstanceOf(InvalidInputError);
	});

	it('throws NotFoundError when not registered', async () => {
		const repo = {
			findByProjectAndDomain: vi.fn().mockResolvedValue(null),
		} as unknown as MacroContext.MonitoredDomainRepository;
		const r = new MonitoredDomainSystemParamResolver(repo);
		await expect(
			r.resolve({
				projectId,
				providerId: 'cloudflare-radar',
				endpointId: 'radar-domain-rank',
				params: { domain },
			}),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});
