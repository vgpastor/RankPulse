import { describe, expect, it } from 'vitest';
import { RankPulseApiError } from './errors.js';
import { HttpClient } from './http.js';

const json = (status: number, body: unknown): Response =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});

describe('HttpClient', () => {
	it('attaches Authorization header when a token is provided', async () => {
		let capturedHeaders: Headers | undefined;
		const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
			void _input;
			capturedHeaders = new Headers(init?.headers);
			return json(200, { ok: true });
		};
		const http = new HttpClient({
			baseUrl: 'http://api.local',
			getAuthToken: () => 'tok-123',
			fetchImpl: fetchImpl as typeof fetch,
		});
		await http.get('/me');
		expect(capturedHeaders?.get('authorization')).toBe('Bearer tok-123');
	});

	it('serializes the body for POST and parses JSON responses', async () => {
		let capturedBody: string | undefined;
		const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
			void _input;
			capturedBody = init?.body as string;
			return json(201, { id: 'abc' });
		};
		const http = new HttpClient({
			baseUrl: 'http://api.local',
			fetchImpl: fetchImpl as typeof fetch,
		});
		const result = await http.post<{ id: string }>('/things', { name: 'x' });
		expect(capturedBody).toBe(JSON.stringify({ name: 'x' }));
		expect(result.id).toBe('abc');
	});

	it('translates RFC 7807 problem responses into RankPulseApiError', async () => {
		const fetchImpl = async (): Promise<Response> =>
			json(409, {
				type: 'about:blank',
				title: 'Conflict',
				status: 409,
				code: 'CONFLICT',
				detail: 'slug already used',
			});
		const http = new HttpClient({
			baseUrl: 'http://api.local',
			fetchImpl: fetchImpl as typeof fetch,
		});
		await expect(http.post('/things', {})).rejects.toMatchObject({
			name: 'RankPulseApiError',
			status: 409,
			code: 'CONFLICT',
		});
		try {
			await http.post('/things', {});
			expect.fail('expected throw');
		} catch (err) {
			expect(err).toBeInstanceOf(RankPulseApiError);
		}
	});

	it('appends query params for GET', async () => {
		let capturedUrl: URL | undefined;
		const fetchImpl = async (input: RequestInfo | URL): Promise<Response> => {
			capturedUrl = input instanceof URL ? input : new URL(String(input));
			return json(200, []);
		};
		const http = new HttpClient({
			baseUrl: 'http://api.local',
			fetchImpl: fetchImpl as typeof fetch,
		});
		await http.get('/projects', { query: { organizationId: 'abc-123', limit: 10 } });
		expect(capturedUrl?.searchParams.get('organizationId')).toBe('abc-123');
		expect(capturedUrl?.searchParams.get('limit')).toBe('10');
	});
});
