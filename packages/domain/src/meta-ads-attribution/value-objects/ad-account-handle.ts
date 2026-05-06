import { InvalidInputError } from '@rankpulse/shared';

/**
 * Meta ad-account handles are addressable as `act_<digits>` in API paths.
 * The Business Manager UI displays them both with and without the `act_`
 * prefix. We canonicalise to the bare numeric form for storage so equality
 * is trivial; the API client adds the prefix when building the URL.
 */
export class MetaAdAccountHandle {
	private constructor(public readonly value: string) {}

	static create(raw: string): MetaAdAccountHandle {
		const trimmed = raw.trim();
		if (trimmed.length === 0) {
			throw new InvalidInputError('Meta adAccountId cannot be empty');
		}
		const stripped = trimmed.startsWith('act_') ? trimmed.slice('act_'.length) : trimmed;
		if (!/^\d+$/.test(stripped)) {
			throw new InvalidInputError('Meta adAccountId must be numeric (or "act_<digits>")');
		}
		return new MetaAdAccountHandle(stripped);
	}

	toApiPath(): string {
		return `act_${this.value}`;
	}
}
