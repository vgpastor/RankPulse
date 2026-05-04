import { InvalidInputError } from '@rankpulse/shared';

const MAX_OBSERVABLE = 200;

/**
 * Search engine result position. `null` represents "not in tracked window"
 * (i.e. beyond the top-N we asked the SERP API to return). We model that as a
 * distinct case rather than `0` so `position - previousPosition` deltas don't
 * accidentally swing through zero when ranking falls off the cliff.
 */
export class Position {
	private constructor(public readonly value: number | null) {}

	static notRanked(): Position {
		return new Position(null);
	}

	static at(rank: number): Position {
		if (!Number.isInteger(rank) || rank < 1 || rank > MAX_OBSERVABLE) {
			throw new InvalidInputError(`Position must be an integer in [1, ${MAX_OBSERVABLE}], got ${rank}`);
		}
		return new Position(rank);
	}

	static fromNullable(rank: number | null): Position {
		return rank === null ? Position.notRanked() : Position.at(rank);
	}

	isRanked(): boolean {
		return this.value !== null;
	}

	isInTopTen(): boolean {
		return this.value !== null && this.value <= 10;
	}

	isOnFirstPage(): boolean {
		return this.value !== null && this.value <= 10;
	}

	delta(other: Position): number | null {
		if (this.value === null || other.value === null) return null;
		return other.value - this.value;
	}

	equals(other: Position): boolean {
		return this.value === other.value;
	}
}
