import { InvalidInputError } from '@rankpulse/shared';

const PROVIDER_ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/;

/**
 * Stable identifier for a data provider, e.g. `dataforseo`, `google-search-console`,
 * `google-analytics-4`, `ahrefs`, `manual-crawler`. Slug-style so it can be used in
 * URLs and routing keys (BullMQ queue names).
 */
export class ProviderId {
	private constructor(public readonly value: string) {}

	static create(raw: string): ProviderId {
		const trimmed = raw.trim().toLowerCase();
		if (!PROVIDER_ID_RE.test(trimmed)) {
			throw new InvalidInputError(`Invalid provider id: ${raw}`);
		}
		return new ProviderId(trimmed);
	}

	equals(other: ProviderId): boolean {
		return this.value === other.value;
	}

	toString(): string {
		return this.value;
	}
}
