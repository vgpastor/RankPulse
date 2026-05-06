import { InvalidInputError } from '@rankpulse/shared';

const MIN_LENGTH = 30;

/**
 * AI Studio API keys come from https://aistudio.google.com/app/apikey and
 * are bare strings prefixed with `AIza` (the Google API-key family). We
 * accept anything that matches the AIza prefix and minimum length so the
 * format check stays robust against Google rotating the suffix shape.
 */
export const parseCredential = (plaintext: string): string => {
	const trimmed = plaintext.trim();
	if (trimmed.length < MIN_LENGTH) {
		throw new InvalidInputError(`Google AI Studio API key looks too short (got ${trimmed.length} chars)`);
	}
	if (!trimmed.startsWith('AIza')) {
		throw new InvalidInputError('Google AI Studio API key must start with "AIza"');
	}
	return trimmed;
};
