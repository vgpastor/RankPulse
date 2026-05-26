import type { FetchContext, HttpClient } from '@rankpulse/provider-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { type CdxResponse, fetchCdxSnapshots } from './cdx-snapshots.js';

/**
 * Captures the (path, query) of the last HTTP call so tests can assert on
 * the EXACT shape sent over the wire. Returns `[]` by default to satisfy
 * the response contract; tests can override `responseBody` to drive
 * different ACL paths.
 */
class RecordingHttpClient implements HttpClient {
	lastPath: string | null = null;
	lastQuery: Record<string, string> | null = null;
	responseBody: unknown = [];

	async get<T>(path: string, query: Record<string, string>, _ctx: FetchContext): Promise<T> {
		this.lastPath = path;
		this.lastQuery = query;
		return this.responseBody as T;
	}
	async post<T>(): Promise<T> {
		throw new Error('not used in CDX tests');
	}
	async put<T>(): Promise<T> {
		throw new Error('not used in CDX tests');
	}
	async delete<T>(): Promise<T> {
		throw new Error('not used in CDX tests');
	}
}

const fakeCtx = (): FetchContext => ({
	credential: { plaintextSecret: '' },
	logger: { debug: () => {}, warn: () => {} },
	now: () => new Date('2026-05-26T00:00:00Z'),
});

describe('fetchCdxSnapshots — wire-format guarantees', () => {
	let http: RecordingHttpClient;

	beforeEach(() => {
		http = new RecordingHttpClient();
	});

	// Regression for #179 follow-up: the worker's `resolveDateTokens`
	// substitutes `{{today-N}}` with canonical ISO `YYYY-MM-DD`. Wayback CDX
	// strictly requires `YYYYMMDD` (no separators) and silently returns `[]`
	// when given the ISO form — so 33 prod runs persisted snapshot_count=0
	// and the activity radar showed all zeros despite Wayback having real
	// data. The fetch layer MUST strip the separators before dispatch.
	it('converts ISO YYYY-MM-DD `from`/`to` to the YYYYMMDD shape Wayback CDX requires', async () => {
		await fetchCdxSnapshots(
			http,
			{ domain: 'silvertracsoftware.com', from: '2026-02-25', to: '2026-05-26', limit: 2000 },
			fakeCtx(),
		);
		expect(http.lastQuery?.from).toBe('20260225');
		expect(http.lastQuery?.to).toBe('20260526');
	});

	it('passes through `from`/`to` already in compact YYYYMMDD form unchanged (idempotent)', async () => {
		await fetchCdxSnapshots(
			http,
			{ domain: 'silvertracsoftware.com', from: '20260225', to: '20260526', limit: 2000 },
			fakeCtx(),
		);
		expect(http.lastQuery?.from).toBe('20260225');
		expect(http.lastQuery?.to).toBe('20260526');
	});

	it('keeps the rest of the query stable (url, matchType, output, limit) — only date fields are normalised', async () => {
		await fetchCdxSnapshots(
			http,
			{ domain: 'example.com', from: '2026-01-01', to: '2026-12-31', limit: 500 },
			fakeCtx(),
		);
		expect(http.lastPath).toBe('/cdx/search/cdx');
		expect(http.lastQuery).toEqual({
			url: 'example.com',
			matchType: 'prefix',
			output: 'json',
			from: '20260101',
			to: '20261231',
			limit: '500',
		});
	});

	it('returns the response as-is when shape is valid (ACL is a separate concern)', async () => {
		const payload: CdxResponse = [
			['urlkey', 'timestamp', 'original', 'mimetype', 'statuscode', 'digest', 'length'],
			['com,example)/', '20260315120000', 'https://example.com/', 'text/html', '200', 'a', '1'],
		];
		http.responseBody = payload;
		const result = await fetchCdxSnapshots(
			http,
			{ domain: 'example.com', from: '2026-02-25', to: '2026-05-26', limit: 2000 },
			fakeCtx(),
		);
		expect(result).toEqual(payload);
	});

	it('returns [] when the API responds with null/undefined (defensive against transient upstream blips)', async () => {
		http.responseBody = null;
		const result = await fetchCdxSnapshots(
			http,
			{ domain: 'example.com', from: '2026-02-25', to: '2026-05-26', limit: 2000 },
			fakeCtx(),
		);
		expect(result).toEqual([]);
	});
});
