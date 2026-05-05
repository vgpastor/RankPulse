import { InvalidInputError } from '@rankpulse/shared';

/**
 * GA4 properties are addressed by a numeric id. The Admin UI shows it
 * sometimes bare (`123456789`) and sometimes prefixed (`properties/123456789`)
 * in URLs and API examples. We canonicalise to the bare numeric form for
 * storage so equality is trivial and indexes are tight, but we accept either
 * shape on the way in.
 */
export class Ga4PropertyHandle {
	private constructor(public readonly value: string) {}

	static create(raw: string): Ga4PropertyHandle {
		const trimmed = raw.trim();
		if (trimmed.length === 0) {
			throw new InvalidInputError('GA4 propertyId cannot be empty');
		}
		const stripped = trimmed.startsWith('properties/') ? trimmed.slice('properties/'.length) : trimmed;
		if (!/^\d+$/.test(stripped)) {
			throw new InvalidInputError('GA4 propertyId must be numeric (or "properties/<digits>")');
		}
		return new Ga4PropertyHandle(stripped);
	}

	toApiPath(): string {
		return `properties/${this.value}`;
	}
}
