import { InvalidInputError } from '@rankpulse/shared';

/**
 * Meta Pixel ids are 8+ digit numeric strings (FB stores them as int64 but
 * the Graph API surfaces them as strings). We accept the bare numeric form
 * only — pixel ids never carry a prefix.
 */
export class MetaPixelHandle {
	private constructor(public readonly value: string) {}

	static create(raw: string): MetaPixelHandle {
		const trimmed = raw.trim();
		if (trimmed.length === 0) {
			throw new InvalidInputError('Meta pixelId cannot be empty');
		}
		if (!/^\d{8,}$/.test(trimmed)) {
			throw new InvalidInputError('Meta pixelId must be a 8+ digit numeric string');
		}
		return new MetaPixelHandle(trimmed);
	}
}
