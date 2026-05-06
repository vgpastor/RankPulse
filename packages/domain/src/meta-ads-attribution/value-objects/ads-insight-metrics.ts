import { InvalidInputError } from '@rankpulse/shared';

export type AdsInsightLevel = 'account' | 'campaign' | 'adset' | 'ad';

const VALID_LEVELS: ReadonlySet<string> = new Set(['account', 'campaign', 'adset', 'ad']);

/**
 * One day's insights for a single Meta ad entity (campaign / adset / ad /
 * account). All counts are integer; `spend` is stored as a USD-denominated
 * float (Meta returns the account's currency — we keep it opaque, the
 * read side knows the account currency from the linked entity).
 */
export class MetaAdsInsightMetrics {
	private constructor(
		public readonly level: AdsInsightLevel,
		public readonly entityId: string,
		public readonly entityName: string,
		public readonly impressions: number,
		public readonly clicks: number,
		public readonly spend: number,
		public readonly conversions: number,
	) {}

	static create(input: {
		level: AdsInsightLevel;
		entityId: string;
		entityName: string;
		impressions: number;
		clicks: number;
		spend: number;
		conversions: number;
	}): MetaAdsInsightMetrics {
		if (!VALID_LEVELS.has(input.level)) {
			throw new InvalidInputError(`level must be one of account|campaign|adset|ad (got "${input.level}")`);
		}
		if (typeof input.entityId !== 'string' || input.entityId.length === 0) {
			throw new InvalidInputError('entityId must be a non-empty string');
		}
		if (typeof input.entityName !== 'string') {
			throw new InvalidInputError('entityName must be a string');
		}
		assertNonNegativeInt(input.impressions, 'impressions');
		assertNonNegativeInt(input.clicks, 'clicks');
		assertNonNegativeInt(input.conversions, 'conversions');
		if (!Number.isFinite(input.spend) || input.spend < 0) {
			throw new InvalidInputError('spend must be a non-negative finite number');
		}
		return new MetaAdsInsightMetrics(
			input.level,
			input.entityId,
			input.entityName,
			input.impressions,
			input.clicks,
			input.spend,
			input.conversions,
		);
	}
}

const assertNonNegativeInt = (value: number, name: string): void => {
	if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
		throw new InvalidInputError(`${name} must be a non-negative integer`);
	}
};
