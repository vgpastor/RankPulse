import { InvalidInputError } from '@rankpulse/shared';

/**
 * Wikipedia article slug — the URL form with underscores replacing
 * spaces (`Eiffel_Tower`, not `Eiffel Tower`). Length cap mirrors
 * Wikipedia's own ~255-char limit. We do NOT URL-encode here; that's a
 * provider/HTTP concern — domain stores the canonical decoded slug so
 * it round-trips through events and reads cleanly.
 */
export class ArticleSlug {
	private constructor(public readonly value: string) {}

	static create(raw: string): ArticleSlug {
		const trimmed = raw.trim();
		if (trimmed.length === 0 || trimmed.length > 255) {
			throw new InvalidInputError(`ArticleSlug must be 1-255 chars (got "${raw}")`);
		}
		// Reject slugs containing whitespace — Wikipedia slugs use
		// underscores. A space here is a sign the caller passed the
		// human title; force them to canonicalise.
		if (/\s/.test(trimmed)) {
			throw new InvalidInputError(
				`ArticleSlug must not contain whitespace; replace spaces with underscores (got "${raw}")`,
			);
		}
		return new ArticleSlug(trimmed);
	}
}
