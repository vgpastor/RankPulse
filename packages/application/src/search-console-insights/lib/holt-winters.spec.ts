import { describe, expect, it } from 'vitest';
import { holtWinters } from './holt-winters.js';

describe('holtWinters', () => {
	it('returns null when fewer than 2 points', () => {
		expect(holtWinters([], { periods: 5 })).toBeNull();
		expect(holtWinters([10], { periods: 5 })).toBeNull();
	});

	it('produces a fitted series the same length as the input history', () => {
		const result = holtWinters([10, 12, 14, 16, 18], { periods: 0 });
		expect(result).not.toBeNull();
		expect(result?.fitted.length).toBe(5);
	});

	it('extrapolates a positive trend when the series grows monotonically', () => {
		const result = holtWinters([10, 20, 30, 40, 50], { periods: 3 });
		expect(result).not.toBeNull();
		expect(result?.trend).toBeGreaterThan(0);
		const fc = result?.forecast ?? [];
		expect(fc[0]).toBeGreaterThan(50);
		expect(fc[1]).toBeGreaterThan(fc[0] ?? 0);
		expect(fc[2]).toBeGreaterThan(fc[1] ?? 0);
	});

	it('clamps forecast to non-negative values', () => {
		// Aggressive downward trend that would cross zero — forecast must clamp.
		const result = holtWinters([100, 80, 60, 40, 20, 5], { periods: 5 });
		expect(result).not.toBeNull();
		const fc = result?.forecast ?? [];
		for (const v of fc) {
			expect(v).toBeGreaterThanOrEqual(0);
		}
	});

	it('returns empty forecast when periods is 0', () => {
		const result = holtWinters([1, 2, 3], { periods: 0 });
		expect(result?.forecast).toHaveLength(0);
	});
});
