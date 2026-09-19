import { ProviderApiError } from '@rankpulse/provider-core';
import { describe, expect, it } from 'vitest';
import {
	classifyDataForSeoStatus,
	type DataForSeoFailureKind,
	isDataForSeoQuotaExhausted,
} from './errors.js';

const error = (status: number, providerId = 'dataforseo') =>
	new ProviderApiError(providerId, status, undefined, `status ${status}`);

describe('classifyDataForSeoStatus', () => {
	const cases: [number, DataForSeoFailureKind, string][] = [
		[40200, 'billing', 'Payment Required'],
		[40203, 'billing', 'cost limit exceeded'],
		[40204, 'billing', 'subscription required'],
		[40210, 'billing', 'Insufficient Funds'],
		[402, 'billing', 'HTTP 402 with no body'],
		[40202, 'rate-limit', 'per-minute rate limit'],
		[40209, 'rate-limit', 'too many simultaneous queries'],
		[429, 'rate-limit', 'HTTP 429'],
		[40100, 'auth', 'not authorized'],
		[40104, 'auth', 'account not verified'],
		[40101, 'upstream', 'Internal SE Server Error'],
		[40106, 'upstream', 'partial results, retry'],
		[50000, 'upstream', 'Internal Error'],
		[40102, 'no-results', 'No Search Results'],
		[40501, 'validation', "Invalid Field — the domain_intersection 'target1' case"],
		[40503, 'validation', 'POST Data Is Invalid'],
		[40506, 'validation', 'Unknown Fields in POST Data'],
		[40006, 'validation', 'more than 100 tasks'],
		[40400, 'not-found', 'Not Found'],
		[40408, 'not-found', 'Target URL is invalid'],
	];
	it.each(cases)('%i → %s (%s)', (status, kind) => {
		expect(classifyDataForSeoStatus(status)).toBe(kind);
	});

	it('falls back to the thousand-block for codes not in the table', () => {
		expect(classifyDataForSeoStatus(40299)).toBe('billing');
		expect(classifyDataForSeoStatus(40599)).toBe('validation');
		expect(classifyDataForSeoStatus(50999)).toBe('upstream');
	});
});

describe('isDataForSeoQuotaExhausted', () => {
	it('pauses on billing failures only', () => {
		expect(isDataForSeoQuotaExhausted(error(40210))).toBe(true);
		expect(isDataForSeoQuotaExhausted(error(40200))).toBe(true);
	});

	// Before this classification the worker treated 40400-40999 as quota:
	// every validation error paused its schedule and was logged as money.
	it('does not mistake a validation or not-found error for quota', () => {
		expect(isDataForSeoQuotaExhausted(error(40501))).toBe(false);
		expect(isDataForSeoQuotaExhausted(error(40400))).toBe(false);
	});

	it('does not pause on a throttle, which clears on its own', () => {
		expect(isDataForSeoQuotaExhausted(error(40202))).toBe(false);
	});

	it('ignores errors from other providers', () => {
		expect(isDataForSeoQuotaExhausted(error(40210, 'openai'))).toBe(false);
		expect(isDataForSeoQuotaExhausted(new Error('40210'))).toBe(false);
	});
});
