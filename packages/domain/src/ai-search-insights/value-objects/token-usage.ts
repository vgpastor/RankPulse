import { InvalidInputError } from '@rankpulse/shared';

/**
 * Per-call token accounting captured from the LLM response. Persisted on the
 * LlmAnswer so the dashboards can show "what did this watchlist cost me last
 * month" without joining against api_usage. The api_usage ledger still records
 * the cost in cents; this is the input/output breakdown that ledger doesn't
 * give us.
 */
export interface TokenUsageProps {
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly cachedInputTokens: number;
	readonly webSearchCalls: number;
}

export class TokenUsage {
	private constructor(private readonly props: TokenUsageProps) {}

	static create(props: TokenUsageProps): TokenUsage {
		for (const [key, value] of Object.entries(props)) {
			if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
				throw new InvalidInputError(`TokenUsage.${key} must be a non-negative integer (got ${value})`);
			}
		}
		return new TokenUsage(props);
	}

	static zero(): TokenUsage {
		return new TokenUsage({ inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, webSearchCalls: 0 });
	}

	get inputTokens(): number {
		return this.props.inputTokens;
	}
	get outputTokens(): number {
		return this.props.outputTokens;
	}
	get cachedInputTokens(): number {
		return this.props.cachedInputTokens;
	}
	get webSearchCalls(): number {
		return this.props.webSearchCalls;
	}

	toJSON(): TokenUsageProps {
		return { ...this.props };
	}
}
