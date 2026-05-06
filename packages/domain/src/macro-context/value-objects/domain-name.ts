import { InvalidInputError } from '@rankpulse/shared';

const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

/**
 * Bare DNS domain name, lowercased and stripped of `www.` for canonical
 * comparison. We reject schemes/paths/ports — Cloudflare Radar's domain
 * ranking is about the registrable apex (or a labelled subdomain), and
 * other macro-context APIs we'll add later use the same shape.
 */
export class DomainName {
	private constructor(public readonly value: string) {}

	static create(raw: string): DomainName {
		const trimmed = raw.trim().toLowerCase();
		if (trimmed.length === 0) throw new InvalidInputError('domain cannot be empty');
		// Strip a leading "www." for canonicalisation. Cloudflare Radar
		// returns the same rank for `example.com` and `www.example.com`.
		const stripped = trimmed.startsWith('www.') ? trimmed.slice(4) : trimmed;
		if (!DOMAIN_REGEX.test(stripped)) {
			throw new InvalidInputError(`"${raw}" is not a valid bare domain (no scheme, no path, no port)`);
		}
		return new DomainName(stripped);
	}
}
