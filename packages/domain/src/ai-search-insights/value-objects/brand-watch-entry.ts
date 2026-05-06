import { InvalidInputError } from '@rankpulse/shared';

/**
 * One brand the watchlist resolver wants the LLM-judge to detect in answers.
 *
 * `aliases` exists because brands rarely match perfectly: "Apple" / "Apple
 * Inc." / "AAPL", "Patroltech" / "Patrol Tech" / "patrol-tech". The judge
 * gets the full list and is told that any of them counts as a match for the
 * canonical `name`.
 *
 * `ownDomains` is the list of hostnames the brand owns. Used by the citation
 * post-processor to set `isOwnDomain` on extracted citations.
 */
export interface BrandWatchEntryProps {
	readonly name: string;
	readonly aliases: readonly string[];
	readonly ownDomains: readonly string[];
	readonly isOwnBrand: boolean;
}

export class BrandWatchEntry {
	private constructor(private readonly props: BrandWatchEntryProps) {}

	static create(props: BrandWatchEntryProps): BrandWatchEntry {
		const name = props.name.trim();
		if (name.length === 0) {
			throw new InvalidInputError('BrandWatchEntry.name cannot be empty');
		}
		const aliases = props.aliases.map((a) => a.trim()).filter((a) => a.length > 0);
		const ownDomains = props.ownDomains.map((d) => d.trim().toLowerCase()).filter((d) => d.length > 0);
		return new BrandWatchEntry({ name, aliases, ownDomains, isOwnBrand: props.isOwnBrand });
	}

	get name(): string {
		return this.props.name;
	}
	get aliases(): readonly string[] {
		return this.props.aliases;
	}
	get ownDomains(): readonly string[] {
		return this.props.ownDomains;
	}
	get isOwnBrand(): boolean {
		return this.props.isOwnBrand;
	}

	allMatchTerms(): readonly string[] {
		return [this.props.name, ...this.props.aliases];
	}

	toJSON(): BrandWatchEntryProps {
		return {
			name: this.props.name,
			aliases: [...this.props.aliases],
			ownDomains: [...this.props.ownDomains],
			isOwnBrand: this.props.isOwnBrand,
		};
	}
}
