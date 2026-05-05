import { describe, expect, it } from 'vitest';
import {
	DATE_OR_TOKEN_REGEX,
	isAbsoluteDate,
	isDateToken,
	resolveDateToken,
	resolveDateTokens,
} from './date-tokens.js';
import { InvalidInputError } from './errors.js';

const NOW = new Date('2026-05-04T08:30:00Z');

describe('resolveDateToken', () => {
	it('returns absolute YYYY-MM-DD dates unchanged', () => {
		expect(resolveDateToken('2026-01-15', NOW)).toBe('2026-01-15');
	});

	it('resolves {{today}} to the UTC calendar date of `now`', () => {
		expect(resolveDateToken('{{today}}', NOW)).toBe('2026-05-04');
	});

	it('resolves {{today-N}} to N calendar days before today (UTC)', () => {
		expect(resolveDateToken('{{today-2}}', NOW)).toBe('2026-05-02');
		expect(resolveDateToken('{{today-30}}', NOW)).toBe('2026-04-04');
	});

	it('handles month/year boundaries via UTC arithmetic', () => {
		expect(resolveDateToken('{{today-4}}', NOW)).toBe('2026-04-30');
		const earlyJan = new Date('2026-01-02T00:00:00Z');
		expect(resolveDateToken('{{today-3}}', earlyJan)).toBe('2025-12-30');
	});

	it('treats time-of-day as irrelevant — same calendar day regardless of `now` hour', () => {
		const morning = new Date('2026-05-04T00:00:01Z');
		const evening = new Date('2026-05-04T23:59:59Z');
		expect(resolveDateToken('{{today}}', morning)).toBe(resolveDateToken('{{today}}', evening));
	});

	it('throws InvalidInputError on malformed tokens', () => {
		expect(() => resolveDateToken('{{tomorrow}}', NOW)).toThrow(InvalidInputError);
		expect(() => resolveDateToken('today', NOW)).toThrow(InvalidInputError);
		expect(() => resolveDateToken('{{today+1}}', NOW)).toThrow(InvalidInputError);
		expect(() => resolveDateToken('2026/05/04', NOW)).toThrow(InvalidInputError);
	});

	it('rejects negative-offset attempts (`{{today--1}}`)', () => {
		// Regex won't match `{{today--1}}`, so it goes through the malformed branch.
		expect(() => resolveDateToken('{{today--1}}', NOW)).toThrow(InvalidInputError);
	});
});

describe('resolveDateTokens (recursive)', () => {
	it('walks string fields in a flat object and substitutes only token-shaped strings', () => {
		const params = {
			siteUrl: 'sc-domain:patroltech.online',
			startDate: '{{today-30}}',
			endDate: '{{today-2}}',
			rowLimit: 25_000,
			type: 'web',
		};
		expect(resolveDateTokens(params, NOW)).toEqual({
			siteUrl: 'sc-domain:patroltech.online',
			startDate: '2026-04-04',
			endDate: '2026-05-02',
			rowLimit: 25_000,
			type: 'web',
		});
	});

	it('descends into nested objects', () => {
		const params = { dateRange: { startDate: '{{today-7}}', endDate: '{{today}}' } };
		expect(resolveDateTokens(params, NOW)).toEqual({
			dateRange: { startDate: '2026-04-27', endDate: '2026-05-04' },
		});
	});

	it('walks arrays element-wise', () => {
		const params = { windows: ['{{today-1}}', '{{today-7}}', 'literal'] };
		expect(resolveDateTokens(params, NOW)).toEqual({ windows: ['2026-05-03', '2026-04-27', 'literal'] });
	});

	it('returns a new object — never mutates the input', () => {
		const original = { startDate: '{{today-2}}' };
		const resolved = resolveDateTokens(original, NOW);
		expect(resolved).not.toBe(original);
		expect(original.startDate).toBe('{{today-2}}');
	});

	it('passes non-string scalars (numbers, booleans, null) through unchanged', () => {
		expect(resolveDateTokens({ n: 42, b: true, x: null }, NOW)).toEqual({ n: 42, b: true, x: null });
	});

	it('leaves non-token-shaped strings alone (typos like `{{tomorrow}}` pass through to the provider as literals)', () => {
		// `resolveDateTokens` only resolves strings matching the token shape;
		// anything else is left for the provider's own param validation
		// to reject. Avoids a footgun where a typo silently becomes "today".
		expect(resolveDateTokens({ x: '{{tomorrow}}' }, NOW)).toEqual({ x: '{{tomorrow}}' });
	});
});

describe('predicates and shared regex', () => {
	it('isAbsoluteDate accepts strict YYYY-MM-DD and rejects everything else', () => {
		expect(isAbsoluteDate('2026-05-04')).toBe(true);
		expect(isAbsoluteDate('{{today}}')).toBe(false);
		expect(isAbsoluteDate('2026-5-4')).toBe(false);
	});

	it('isDateToken accepts only the supported token shapes', () => {
		expect(isDateToken('{{today}}')).toBe(true);
		expect(isDateToken('{{today-7}}')).toBe(true);
		expect(isDateToken('2026-05-04')).toBe(false);
		expect(isDateToken('{{yesterday}}')).toBe(false);
	});

	it('DATE_OR_TOKEN_REGEX is the union of both — for Zod schemas in contracts', () => {
		expect(DATE_OR_TOKEN_REGEX.test('2026-05-04')).toBe(true);
		expect(DATE_OR_TOKEN_REGEX.test('{{today}}')).toBe(true);
		expect(DATE_OR_TOKEN_REGEX.test('{{today-30}}')).toBe(true);
		expect(DATE_OR_TOKEN_REGEX.test('foo')).toBe(false);
	});
});
