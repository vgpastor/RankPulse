import { ProviderConnectivity } from '@rankpulse/domain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ProviderRegistry } from './registry.js';
import type { Provider } from './types.js';

const stubProvider = (idValue: string): Provider => ({
	id: ProviderConnectivity.ProviderId.create(idValue),
	displayName: idValue,
	authStrategy: 'apiKey',
	discover: () => [
		{
			id: 'endpoint-a',
			category: 'rankings',
			displayName: 'Endpoint A',
			description: 'For tests',
			paramsSchema: z.object({ q: z.string() }),
			cost: { unit: 'usd_cents', amount: 35 } as const,
			defaultCron: '0 6 * * 1',
			rateLimit: { max: 60, durationMs: 60_000 },
		},
	],
	async fetch() {
		return { ok: true };
	},
});

describe('ProviderRegistry', () => {
	it('registers and retrieves providers by id', () => {
		const registry = new ProviderRegistry();
		const provider = stubProvider('dataforseo');
		registry.register(provider);
		expect(registry.has('dataforseo')).toBe(true);
		expect(registry.get('dataforseo')).toBe(provider);
	});

	it('rejects duplicate registration of the same id', () => {
		const registry = new ProviderRegistry();
		registry.register(stubProvider('dataforseo'));
		expect(() => registry.register(stubProvider('dataforseo'))).toThrow(/already registered/);
	});

	it('throws NotFoundError for unknown ids', () => {
		const registry = new ProviderRegistry();
		expect(() => registry.get('ahrefs')).toThrowError(/is not registered/);
	});

	it('exposes endpoint descriptors via endpoint()', () => {
		const registry = new ProviderRegistry();
		registry.register(stubProvider('dataforseo'));
		const ep = registry.endpoint('dataforseo', 'endpoint-a');
		expect(ep.category).toBe('rankings');
		expect(ep.cost.amount).toBe(35);
	});
});
