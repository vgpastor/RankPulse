import { InvalidInputError } from '@rankpulse/shared';

/**
 * Bing rank-and-traffic stats for a single calendar day. Counts are required;
 * average positions are optional because Bing returns null for days with no
 * impressions (avg-of-empty is undefined).
 */
export class BingTrafficMetrics {
	private constructor(
		public readonly clicks: number,
		public readonly impressions: number,
		public readonly avgClickPosition: number | null,
		public readonly avgImpressionPosition: number | null,
	) {}

	static create(input: {
		clicks: number;
		impressions: number;
		avgClickPosition: number | null;
		avgImpressionPosition: number | null;
	}): BingTrafficMetrics {
		if (!Number.isFinite(input.clicks) || input.clicks < 0) {
			throw new InvalidInputError('clicks must be a non-negative number');
		}
		if (!Number.isFinite(input.impressions) || input.impressions < 0) {
			throw new InvalidInputError('impressions must be a non-negative number');
		}
		const validatePos = (pos: number | null, label: string): number | null => {
			if (pos === null) return null;
			if (!Number.isFinite(pos) || pos < 1) {
				throw new InvalidInputError(`${label} must be >= 1 when present (Bing positions are 1-indexed)`);
			}
			return pos;
		};
		return new BingTrafficMetrics(
			Math.round(input.clicks),
			Math.round(input.impressions),
			validatePos(input.avgClickPosition, 'avgClickPosition'),
			validatePos(input.avgImpressionPosition, 'avgImpressionPosition'),
		);
	}
}
