import { InvalidInputError } from '@rankpulse/shared';

/**
 * GSC search analytics row for a single (date, query, page, country, device)
 * combination. CTR is computed (`clicks / impressions`) but stored explicitly
 * because GSC may report it with rounding for low-impression rows.
 */
export class PerformanceMetrics {
	private constructor(
		public readonly clicks: number,
		public readonly impressions: number,
		public readonly ctr: number,
		public readonly position: number,
	) {}

	static create(input: {
		clicks: number;
		impressions: number;
		ctr: number;
		position: number;
	}): PerformanceMetrics {
		if (!Number.isFinite(input.clicks) || input.clicks < 0) {
			throw new InvalidInputError('clicks must be a non-negative number');
		}
		if (!Number.isFinite(input.impressions) || input.impressions < 0) {
			throw new InvalidInputError('impressions must be a non-negative number');
		}
		if (!Number.isFinite(input.ctr) || input.ctr < 0 || input.ctr > 1) {
			throw new InvalidInputError('ctr must be in [0, 1]');
		}
		if (!Number.isFinite(input.position) || input.position < 0) {
			throw new InvalidInputError('position must be a non-negative number');
		}
		return new PerformanceMetrics(
			Math.round(input.clicks),
			Math.round(input.impressions),
			input.ctr,
			input.position,
		);
	}
}
