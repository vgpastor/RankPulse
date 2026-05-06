import { InvalidInputError } from '@rankpulse/shared';

/**
 * OpenAI uses a Bearer token of the form `sk-...`. We accept anything
 * starting with `sk-` and minimum length, since OpenAI rotates the
 * exact format occasionally and validating shape too strictly creates
 * false rejections every time the suffix changes.
 */
const MIN_LENGTH = 20;

export const parseCredential = (plaintext: string): string => {
	const trimmed = plaintext.trim();
	if (trimmed.length < MIN_LENGTH) {
		throw new InvalidInputError(`OpenAI API key looks too short (got ${trimmed.length} chars)`);
	}
	if (!trimmed.startsWith('sk-')) {
		throw new InvalidInputError('OpenAI API key must start with "sk-"');
	}
	return trimmed;
};

export const buildBearerHeader = (apiKey: string): string => `Bearer ${apiKey}`;
