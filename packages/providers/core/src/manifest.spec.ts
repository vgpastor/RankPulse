import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type {
	AclContext,
	AuthStrategy,
	EndpointManifest,
	HttpConfig,
	IngestBinding,
	ProviderManifest,
} from './manifest.js';

describe('ProviderManifest types', () => {
	it('compiles a minimal manifest', () => {
		const sampleSchema = z.object({ url: z.string() });
		type SampleParams = z.infer<typeof sampleSchema>;
		interface SampleResponse {
			ok: true;
		}

		const manifest: ProviderManifest = {
			id: 'sample',
			displayName: 'Sample Provider',
			http: { baseUrl: 'https://api.example.com', auth: { kind: 'bearer-token' } },
			validateCredentialPlaintext: () => {},
			endpoints: [
				{
					descriptor: {
						id: 'sample-endpoint',
						category: 'rankings',
						displayName: 'Sample',
						description: 'desc',
						paramsSchema: sampleSchema,
						cost: { unit: 'usd_cents', amount: 0 },
						defaultCron: '0 5 * * *',
						rateLimit: { max: 60, durationMs: 60_000 },
					},
					fetch: async () => ({ ok: true }) satisfies SampleResponse,
					ingest: null,
				} satisfies EndpointManifest<SampleParams, SampleResponse>,
			],
			buildHttpClient: () => ({
				get: async () => ({}) as never,
				post: async () => ({}) as never,
				put: async () => ({}) as never,
				delete: async () => ({}) as never,
			}),
		};
		expect(manifest.id).toBe('sample');
	});

	it('endpoint with ingest binding compiles', () => {
		const ingest: IngestBinding<{ rows: unknown[] }> = {
			useCaseKey: 'sample:ingest',
			systemParamKey: 'sampleEntityId',
			acl: (response, _ctx: AclContext) => response.rows,
		};
		expect(ingest.useCaseKey).toBe('sample:ingest');
	});

	it('AuthStrategy discriminated union covers expected kinds', () => {
		const strategies: AuthStrategy[] = [
			{ kind: 'bearer-token' },
			{ kind: 'api-key-header', headerName: 'X-API-Key' },
			{ kind: 'basic' },
			{ kind: 'oauth-token' },
			{ kind: 'service-account-jwt' },
			{ kind: 'api-key-or-service-account-jwt' },
			{ kind: 'custom', sign: (req) => req },
		];
		expect(strategies).toHaveLength(7);
	});

	it('HttpConfig accepts optional timeoutMs and retries', () => {
		const config: HttpConfig = {
			baseUrl: 'https://api.example.com',
			auth: { kind: 'bearer-token' },
			defaultTimeoutMs: 30_000,
			defaultRetries: 3,
		};
		expect(config.defaultTimeoutMs).toBe(30_000);
	});
});
