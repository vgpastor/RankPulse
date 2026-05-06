import { InvalidInputError } from '@rankpulse/shared';

/**
 * Microsoft Clarity addresses projects by an opaque handle ("project id"
 * in Microsoft's UI — a 10-character alphanumeric slug shown in the URL).
 * The token's scope is the project, so this handle is mostly a display
 * label for the operator; the credential pinning is what actually
 * partitions the API calls.
 */
const HANDLE_REGEX = /^[a-zA-Z0-9]{8,32}$/;

export class ClarityProjectHandle {
	private constructor(public readonly value: string) {}

	static create(raw: string): ClarityProjectHandle {
		const trimmed = raw.trim();
		if (!HANDLE_REGEX.test(trimmed)) {
			throw new InvalidInputError(
				'Clarity project handle must be 8-32 alphanumeric characters (the slug shown in the Clarity URL)',
			);
		}
		return new ClarityProjectHandle(trimmed);
	}
}
