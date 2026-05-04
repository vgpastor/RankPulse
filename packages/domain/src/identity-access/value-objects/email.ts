import { InvalidInputError } from '@rankpulse/shared';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class Email {
	private constructor(public readonly value: string) {}

	static create(raw: string): Email {
		const trimmed = raw.trim().toLowerCase();
		if (!EMAIL_RE.test(trimmed)) {
			throw new InvalidInputError(`Invalid email: ${raw}`);
		}
		return new Email(trimmed);
	}

	equals(other: Email): boolean {
		return this.value === other.value;
	}

	toString(): string {
		return this.value;
	}
}
