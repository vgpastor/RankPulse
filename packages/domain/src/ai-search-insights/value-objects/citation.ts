import { InvalidInputError } from '@rankpulse/shared';

/**
 * A URL the LLM cited as a source. We track citations independently of
 * mentions: an LLM may cite our blog without mentioning our brand, and may
 * mention our brand without citing us — both signals matter for SEO.
 *
 * `domain` is precomputed (host of the URL, lowercased, no www) so the
 * dashboards can group by domain without JS-side parsing on every render.
 *
 * `isOwnDomain` is set by the BrandWatchlistResolver against the project's
 * own domains; the LLM-judge does not need to know what the project owns.
 */
export interface CitationProps {
	readonly url: string;
	readonly domain: string;
	readonly isOwnDomain: boolean;
}

export class Citation {
	private constructor(private readonly props: CitationProps) {}

	static create(props: CitationProps): Citation {
		const url = props.url.trim();
		if (url.length === 0) {
			throw new InvalidInputError('Citation.url cannot be empty');
		}
		const domain = props.domain.trim().toLowerCase();
		if (domain.length === 0) {
			throw new InvalidInputError('Citation.domain cannot be empty');
		}
		return new Citation({ url, domain, isOwnDomain: props.isOwnDomain });
	}

	/**
	 * Convenience builder: derives the host from the URL itself. Falls back
	 * to the raw URL string when parsing fails so we don't lose the citation
	 * just because the LLM produced a malformed link — it still counts as
	 * a citation, just not groupable by host.
	 */
	static fromUrl(url: string, ownDomains: readonly string[]): Citation {
		const trimmed = url.trim();
		let host = trimmed.toLowerCase();
		try {
			host = new URL(trimmed).host.toLowerCase().replace(/^www\./, '');
		} catch {
			// Non-fatal: keep `host` as the raw URL.
		}
		const isOwn = ownDomains.some(
			(own) => host === own.toLowerCase() || host.endsWith(`.${own.toLowerCase()}`),
		);
		return Citation.create({ url: trimmed, domain: host, isOwnDomain: isOwn });
	}

	get url(): string {
		return this.props.url;
	}
	get domain(): string {
		return this.props.domain;
	}
	get isOwnDomain(): boolean {
		return this.props.isOwnDomain;
	}

	toJSON(): CitationProps {
		return { ...this.props };
	}
}
