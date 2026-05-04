import { InvalidInputError } from '@rankpulse/shared';

const ENDPOINT_ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,60}[a-z0-9])?$/;

/**
 * Provider-scoped logical endpoint id: `serp-google-organic-live`,
 * `labs-bulk-keyword-difficulty`, `gsc-search-analytics`, etc. Used together
 * with a `ProviderId` to form a globally unique key.
 */
export class EndpointId {
	private constructor(public readonly value: string) {}

	static create(raw: string): EndpointId {
		const trimmed = raw.trim().toLowerCase();
		if (!ENDPOINT_ID_RE.test(trimmed)) {
			throw new InvalidInputError(`Invalid endpoint id: ${raw}`);
		}
		return new EndpointId(trimmed);
	}

	equals(other: EndpointId): boolean {
		return this.value === other.value;
	}

	toString(): string {
		return this.value;
	}
}
