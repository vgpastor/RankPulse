import { InvalidInputError } from '@rankpulse/shared';

/**
 * One day's stats for a single pixel event (e.g. `Purchase`):
 *   - `count`: how many times the event fired
 *   - `valueSum`: aggregate of the `value` parameter across those fires
 *     (currency follows the pixel's owning ad-account; we don't normalise).
 *
 * Both must be finite, non-negative numbers. Meta sometimes emits
 * fractional `value` (cart abandonment partials), so `valueSum` is a
 * float; `count` is integer.
 */
export class MetaPixelEventStats {
	private constructor(
		public readonly count: number,
		public readonly valueSum: number,
	) {}

	static create(input: { count: number; valueSum: number }): MetaPixelEventStats {
		if (!Number.isFinite(input.count) || input.count < 0 || !Number.isInteger(input.count)) {
			throw new InvalidInputError('pixel event count must be a non-negative integer');
		}
		if (!Number.isFinite(input.valueSum) || input.valueSum < 0) {
			throw new InvalidInputError('pixel event valueSum must be a non-negative finite number');
		}
		return new MetaPixelEventStats(input.count, input.valueSum);
	}
}
