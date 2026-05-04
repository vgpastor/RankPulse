import { InvalidInputError } from '@rankpulse/shared';

export class KeywordPhrase {
	private constructor(public readonly value: string) {}

	static create(raw: string): KeywordPhrase {
		const collapsed = raw.trim().replace(/\s+/g, ' ');
		if (collapsed.length < 1) {
			throw new InvalidInputError('Keyword phrase cannot be empty');
		}
		if (collapsed.length > 200) {
			throw new InvalidInputError('Keyword phrase too long (max 200 chars)');
		}
		return new KeywordPhrase(collapsed.toLowerCase());
	}

	equals(other: KeywordPhrase): boolean {
		return this.value === other.value;
	}

	toString(): string {
		return this.value;
	}
}
