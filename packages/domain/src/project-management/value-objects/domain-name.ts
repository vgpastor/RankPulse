import { InvalidInputError } from '@rankpulse/shared';

const HOST_RE = /^(?=.{1,253}$)(?:(?!-)[A-Za-z0-9-]{1,63}(?<!-)\.)+[A-Za-z]{2,63}$/;

/**
 * Bare registrable domain (e.g. `controlrondas.com`, `controlrondas.mx`).
 * No scheme, no path, no port. Subdomains are allowed.
 */
export class DomainName {
	private constructor(public readonly value: string) {}

	static create(raw: string): DomainName {
		const trimmed = raw.trim().toLowerCase();
		const stripped = trimmed.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
		if (!HOST_RE.test(stripped)) {
			throw new InvalidInputError(`Invalid domain name: ${raw}`);
		}
		return new DomainName(stripped);
	}

	equals(other: DomainName): boolean {
		return this.value === other.value;
	}

	toString(): string {
		return this.value;
	}
}
