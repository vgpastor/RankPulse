import { InvalidInputError } from '@rankpulse/shared';
import { isSentiment, type Sentiment } from './sentiment.js';

/**
 * A single brand mention extracted from an LLM response. Position is 1-based:
 * 1 = the first brand named in the answer, 2 = second, etc. The first-named
 * brand is significantly more salient (search behaviour studies put 60% of
 * downstream clicks on the first listed item) — that's why "average position"
 * is one of the headline metrics in the dashboard.
 */
export interface BrandMentionProps {
	readonly brand: string;
	readonly position: number;
	readonly sentiment: Sentiment;
	readonly citedUrl: string | null;
}

export class BrandMention {
	private constructor(private readonly props: BrandMentionProps) {}

	static create(props: BrandMentionProps): BrandMention {
		const brand = props.brand.trim();
		if (brand.length === 0) {
			throw new InvalidInputError('BrandMention.brand cannot be empty');
		}
		if (!Number.isInteger(props.position) || props.position < 1) {
			throw new InvalidInputError(`BrandMention.position must be a positive integer (got ${props.position})`);
		}
		if (!isSentiment(props.sentiment)) {
			throw new InvalidInputError(`BrandMention.sentiment is invalid: ${props.sentiment}`);
		}
		const citedUrl = props.citedUrl?.trim() ?? null;
		if (citedUrl !== null && citedUrl.length === 0) {
			throw new InvalidInputError('BrandMention.citedUrl cannot be an empty string');
		}
		return new BrandMention({ brand, position: props.position, sentiment: props.sentiment, citedUrl });
	}

	get brand(): string {
		return this.props.brand;
	}
	get position(): number {
		return this.props.position;
	}
	get sentiment(): Sentiment {
		return this.props.sentiment;
	}
	get citedUrl(): string | null {
		return this.props.citedUrl;
	}

	toJSON(): BrandMentionProps {
		return { ...this.props };
	}
}
