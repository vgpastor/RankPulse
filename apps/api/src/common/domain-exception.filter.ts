import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import {
	ConflictError,
	DomainError,
	ForbiddenError,
	InvalidInputError,
	InvariantViolationError,
	NotFoundError,
	UnauthorizedError,
} from '@rankpulse/shared';
import type { Response } from 'express';

const STATUS_BY_ERROR: Record<string, number> = {
	INVALID_INPUT: 400,
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	CONFLICT: 409,
	INVARIANT_VIOLATION: 422,
};

const TITLE_BY_STATUS: Record<number, string> = {
	400: 'Bad Request',
	401: 'Unauthorized',
	403: 'Forbidden',
	404: 'Not Found',
	409: 'Conflict',
	422: 'Unprocessable Entity',
	500: 'Internal Server Error',
};

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
	private readonly logger = new Logger(DomainExceptionFilter.name);

	catch(exception: unknown, host: ArgumentsHost): void {
		const ctx = host.switchToHttp();
		const res = ctx.getResponse<Response>();

		if (exception instanceof DomainError) {
			const status = STATUS_BY_ERROR[exception.code] ?? 500;
			res.status(status).json({
				type: 'about:blank',
				title: TITLE_BY_STATUS[status] ?? 'Error',
				status,
				code: exception.code,
				detail: exception.message,
			});
			return;
		}

		if (exception instanceof HttpException) {
			const status = exception.getStatus();
			const response = exception.getResponse();
			const body =
				typeof response === 'object' && response !== null
					? (response as Record<string, unknown>)
					: { detail: String(response) };
			res.status(status).json({
				type: 'about:blank',
				title: TITLE_BY_STATUS[status] ?? 'Error',
				status,
				...body,
			});
			return;
		}

		this.logger.error('Unhandled exception', exception);
		res.status(500).json({
			type: 'about:blank',
			title: 'Internal Server Error',
			status: 500,
			code: 'INTERNAL',
			detail: 'An unexpected error occurred',
		});
	}
}

// Re-export domain error symbols so the filter is the single source of truth
// for HTTP mapping. Anyone wanting to throw an error from a controller can use
// these directly without depending on the filter.
export {
	ConflictError,
	ForbiddenError,
	InvalidInputError,
	InvariantViolationError,
	NotFoundError,
	UnauthorizedError,
};
