import { describe, expect, it } from 'vitest';
import { safeIso } from './iso.js';

describe('safeIso', () => {
	it('returns the ISO-8601 string for a valid date', () => {
		expect(safeIso(new Date('2026-05-07T12:34:56.789Z'))).toBe('2026-05-07T12:34:56.789Z');
	});

	it('returns the epoch when the date is invalid (NaN time)', () => {
		expect(safeIso(new Date(Number.NaN))).toBe('1970-01-01T00:00:00.000Z');
	});

	it('returns the epoch when the date is an Invalid Date sentinel', () => {
		expect(safeIso(new Date('not-a-date'))).toBe('1970-01-01T00:00:00.000Z');
	});
});
