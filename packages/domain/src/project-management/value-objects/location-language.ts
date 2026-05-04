import { InvalidInputError } from '@rankpulse/shared';

const COUNTRY_RE = /^[A-Z]{2}$/;
const LANGUAGE_RE = /^[a-z]{2}(?:-[A-Z]{2})?$/;

/**
 * (country, language) pair used by SERP / GSC queries.
 * Example: { country: 'ES', language: 'es' }, { country: 'US', language: 'en-US' }.
 */
export class LocationLanguage {
	private constructor(
		public readonly country: string,
		public readonly language: string,
	) {}

	static create(input: { country: string; language: string }): LocationLanguage {
		const country = input.country.trim().toUpperCase();
		const language = input.language.trim();
		if (!COUNTRY_RE.test(country)) {
			throw new InvalidInputError(`Invalid country code (expected ISO 3166-1 alpha-2): ${input.country}`);
		}
		if (!LANGUAGE_RE.test(language)) {
			throw new InvalidInputError(`Invalid language code: ${input.language}`);
		}
		return new LocationLanguage(country, language);
	}

	equals(other: LocationLanguage): boolean {
		return this.country === other.country && this.language === other.language;
	}

	toString(): string {
		return `${this.language}-${this.country}`;
	}
}
