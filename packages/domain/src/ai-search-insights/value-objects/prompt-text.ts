import { InvalidInputError } from '@rankpulse/shared';

const MIN_LENGTH = 3;
const MAX_LENGTH = 1000;

/**
 * The user-facing prompt that we ship to LLMs verbatim.
 *
 * Bounded at 1000 chars so a single response fits inside even the most
 * conservative LLM context budget once the system instruction and watchlist
 * are added by the worker. Longer prompts than that are almost always a
 * paragraph that should be split into multiple BrandPrompts anyway.
 */
export class PromptText {
	private constructor(public readonly value: string) {}

	static create(input: string): PromptText {
		const trimmed = input.trim();
		if (trimmed.length < MIN_LENGTH) {
			throw new InvalidInputError(`Prompt text is too short (min ${MIN_LENGTH} chars)`);
		}
		if (trimmed.length > MAX_LENGTH) {
			throw new InvalidInputError(`Prompt text is too long (max ${MAX_LENGTH} chars)`);
		}
		return new PromptText(trimmed);
	}

	equals(other: PromptText): boolean {
		return this.value === other.value;
	}

	toString(): string {
		return this.value;
	}
}
