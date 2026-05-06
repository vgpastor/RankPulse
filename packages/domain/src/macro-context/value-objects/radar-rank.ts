import { InvalidInputError } from '@rankpulse/shared';

/**
 * Cloudflare Radar's domain rank — a positive integer position in the
 * global popularity list. Long-tail / unranked domains return null. We
 * reject negative or non-integer values defensively, even though the
 * provider should never emit them.
 */
export class RadarRank {
	private constructor(
		public readonly rank: number | null,
		public readonly bucket: string | null,
		public readonly categories: Readonly<Record<string, number>>,
	) {}

	static create(input: {
		rank: number | null;
		bucket: string | null;
		categories: Record<string, number>;
	}): RadarRank {
		if (input.rank !== null) {
			if (!Number.isFinite(input.rank) || input.rank < 1 || !Number.isInteger(input.rank)) {
				throw new InvalidInputError('rank must be a positive integer when present');
			}
		}
		const cats: Record<string, number> = {};
		for (const [k, v] of Object.entries(input.categories ?? {})) {
			if (!Number.isFinite(v) || v < 1 || !Number.isInteger(v)) {
				throw new InvalidInputError(`category rank "${k}" must be a positive integer`);
			}
			cats[k] = v;
		}
		return new RadarRank(input.rank, input.bucket, cats);
	}
}
