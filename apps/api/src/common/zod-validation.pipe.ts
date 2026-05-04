import { type ArgumentMetadata, BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
	constructor(private readonly schema: ZodSchema<T>) {}

	transform(value: unknown, _metadata: ArgumentMetadata): T {
		const parsed = this.schema.safeParse(value);
		if (!parsed.success) {
			throw new BadRequestException({
				type: 'about:blank',
				title: 'Validation Failed',
				status: 400,
				code: 'INVALID_INPUT',
				detail: parsed.error.issues
					.map((i) => `${i.path.length > 0 ? i.path.join('.') : 'body'}: ${i.message}`)
					.join('; '),
			});
		}
		return parsed.data;
	}
}

export const zodPipe = <T>(schema: ZodSchema<T>): ZodValidationPipe<T> => new ZodValidationPipe(schema);
