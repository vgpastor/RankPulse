import { InvalidInputError } from '@rankpulse/shared';

const MIN_LENGTH = 20;

export const parseCredential = (plaintext: string): string => {
	const trimmed = plaintext.trim();
	if (trimmed.length < MIN_LENGTH) {
		throw new InvalidInputError(`Anthropic API key looks too short (got ${trimmed.length} chars)`);
	}
	if (!trimmed.startsWith('sk-ant-')) {
		throw new InvalidInputError('Anthropic API key must start with "sk-ant-"');
	}
	return trimmed;
};
