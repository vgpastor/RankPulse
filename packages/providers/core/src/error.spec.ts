import { describe, expect, it } from 'vitest';
import { ProviderApiError, isQuotaExhaustedError } from './error.js';

describe('ProviderApiError', () => {
	it('captures providerId, status, body, message', () => {
		const err = new ProviderApiError('meta', 429, '{"error":"rate"}', 'rate limited');
		expect(err.providerId).toBe('meta');
		expect(err.status).toBe(429);
		expect(err.body).toBe('{"error":"rate"}');
		expect(err.message).toBe('rate limited');
		expect(err.code).toBe('PROVIDER_API_ERROR');
		expect(err.name).toBe('ProviderApiError');
	});

	it('extends Error and is instanceof', () => {
		const err = new ProviderApiError('gsc', 500, undefined, 'boom');
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(ProviderApiError);
	});

	it('body can be undefined (for network/timeout errors)', () => {
		const err = new ProviderApiError('bing', 0, undefined, 'timeout');
		expect(err.body).toBeUndefined();
	});
});

describe('isQuotaExhaustedError', () => {
	it('returns true for status 429', () => {
		expect(isQuotaExhaustedError(new ProviderApiError('any', 429, '', 'rate'))).toBe(true);
	});

	it('returns true for status 402', () => {
		expect(isQuotaExhaustedError(new ProviderApiError('any', 402, '', 'over quota'))).toBe(true);
	});

	it('returns false for other 4xx', () => {
		expect(isQuotaExhaustedError(new ProviderApiError('any', 401, '', 'unauthorized'))).toBe(false);
		expect(isQuotaExhaustedError(new ProviderApiError('any', 404, '', 'not found'))).toBe(false);
	});

	it('returns false for 5xx', () => {
		expect(isQuotaExhaustedError(new ProviderApiError('any', 500, '', 'boom'))).toBe(false);
	});

	it('returns false for non-ProviderApiError', () => {
		expect(isQuotaExhaustedError(new Error('plain'))).toBe(false);
		expect(isQuotaExhaustedError({ status: 429 })).toBe(false);
		expect(isQuotaExhaustedError(null)).toBe(false);
	});
});
