import { InvalidInputError } from '@rankpulse/shared';

const MAX_RANK = 200;

/**
 * One row of a SERP top-N: position + domain + url + title. The domain is
 * stored normalized (lowercase, no leading `www.`) so set-membership lookups
 * against tracked / competitor domains stay O(1) without re-normalising on
 * every read. Title is optional because some SERP item types (e.g. AI
 * overviews echoed as organic) ship without a title.
 */
export class SerpResult {
	private constructor(
		public readonly rank: number,
		public readonly domain: string,
		public readonly url: string | null,
		public readonly title: string | null,
	) {}

	static create(input: {
		rank: number;
		domain: string;
		url: string | null;
		title: string | null;
	}): SerpResult {
		if (!Number.isInteger(input.rank) || input.rank < 1 || input.rank > MAX_RANK) {
			throw new InvalidInputError(
				`SerpResult.rank must be an integer in [1, ${MAX_RANK}], got ${input.rank}`,
			);
		}
		const normalized = SerpResult.normalizeDomain(input.domain);
		if (normalized.length === 0) {
			throw new InvalidInputError('SerpResult.domain must not be empty');
		}
		return new SerpResult(input.rank, normalized, input.url, input.title);
	}

	static normalizeDomain(raw: string): string {
		return raw
			.trim()
			.toLowerCase()
			.replace(/^www\./, '');
	}
}
