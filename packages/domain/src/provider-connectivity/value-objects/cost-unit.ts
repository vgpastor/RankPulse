import { InvalidInputError } from '@rankpulse/shared';

/**
 * Monetary amount expressed in USD cents (integer). Avoids float precision
 * issues for accumulating per-API-call costs (e.g. DataForSEO SERP at $0.0035
 * is stored as 0.35 cents). All ledger entries and budgets share this unit.
 */
export class CostUnit {
	private constructor(public readonly cents: number) {}

	static fromCents(cents: number): CostUnit {
		if (!Number.isFinite(cents)) {
			throw new InvalidInputError(`Cost cents must be finite, got ${cents}`);
		}
		if (cents < 0) {
			throw new InvalidInputError(`Cost cents must be non-negative, got ${cents}`);
		}
		return new CostUnit(cents);
	}

	static fromUsd(usd: number): CostUnit {
		return CostUnit.fromCents(Math.round(usd * 100 * 1_000_000) / 1_000_000);
	}

	plus(other: CostUnit): CostUnit {
		return new CostUnit(this.cents + other.cents);
	}

	gt(other: CostUnit): boolean {
		return this.cents > other.cents;
	}

	toUsdString(): string {
		return `$${(this.cents / 100).toFixed(4)}`;
	}
}
