import { InvalidInputError } from '@rankpulse/shared';

/**
 * 5- or 6-field cron expression validated by structural regex. Semantic
 * validation (range checks, valid step values) is delegated to the BullMQ
 * scheduler, which already runs `cron-parser` internally.
 */
export class CronExpression {
	private constructor(public readonly value: string) {}

	static create(raw: string): CronExpression {
		const collapsed = raw.trim().replace(/\s+/g, ' ');
		const fields = collapsed.split(' ');
		if (fields.length !== 5 && fields.length !== 6) {
			throw new InvalidInputError(`Cron expression must have 5 or 6 fields, got "${raw}"`);
		}
		const allowed = /^[\d*/,\-?LWA-Z#]+$/i;
		for (const field of fields) {
			if (!allowed.test(field)) {
				throw new InvalidInputError(`Invalid character in cron field "${field}"`);
			}
		}
		return new CronExpression(collapsed);
	}

	toString(): string {
		return this.value;
	}
}
