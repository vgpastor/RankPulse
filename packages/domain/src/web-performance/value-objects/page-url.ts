import { InvalidInputError } from '@rankpulse/shared';

/**
 * Absolute URL of a page tracked for performance metrics. Stored
 * canonical: scheme + host + path, no fragments. Trailing slash is
 * preserved (PSI treats `/` and `/index` as different rows).
 */
export class PageUrl {
	private constructor(public readonly value: string) {}

	static create(raw: string): PageUrl {
		const trimmed = raw.trim();
		if (trimmed.length === 0 || trimmed.length > 2048) {
			throw new InvalidInputError(`PageUrl must be 1-2048 chars (got "${raw}")`);
		}
		let parsed: URL;
		try {
			parsed = new URL(trimmed);
		} catch {
			throw new InvalidInputError(`PageUrl is not a valid absolute URL: "${raw}"`);
		}
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
			throw new InvalidInputError(`PageUrl must use http(s); got "${parsed.protocol}"`);
		}
		// Drop fragment (`#section`) — PSI ignores it but two URLs that
		// only differ by fragment would otherwise produce two rows in the
		// unique index for the same canonical resource.
		parsed.hash = '';
		return new PageUrl(parsed.toString());
	}
}
