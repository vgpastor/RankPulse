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
	429: 'Too Many Requests',
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
			const detail = this.detailFromHttpException(response);
			const code = this.codeFromHttpException(response, status);
			res.status(status).json({
				type: 'about:blank',
				title: TITLE_BY_STATUS[status] ?? 'Error',
				status,
				code,
				detail,
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

	/**
	 * Normalize the body that comes out of NestJS HttpException / Express
	 * body-parser into the RFC 7807 shape the rest of the API uses. When the
	 * underlying response object exposes a `message`/`error`/`statusCode`
	 * triple (the default Express shape), we map it instead of spreading it.
	 */
	private detailFromHttpException(response: unknown): string {
		if (typeof response === 'string') return response;
		if (typeof response === 'object' && response !== null) {
			const obj = response as { message?: unknown; detail?: unknown };
			if (typeof obj.detail === 'string') return obj.detail;
			if (Array.isArray(obj.message)) return obj.message.join('; ');
			if (typeof obj.message === 'string') return obj.message;
		}
		return 'HTTP error';
	}

	private codeFromHttpException(response: unknown, status: number): string {
		if (typeof response === 'object' && response !== null) {
			const obj = response as { code?: unknown };
			if (typeof obj.code === 'string') return obj.code;
		}
		return CODE_BY_STATUS[status] ?? 'HTTP_ERROR';
	}
}

const CODE_BY_STATUS: Record<number, string> = {
	400: 'BAD_REQUEST',
	401: 'UNAUTHORIZED',
	403: 'FORBIDDEN',
	404: 'NOT_FOUND',
	409: 'CONFLICT',
	422: 'INVARIANT_VIOLATION',
	429: 'TOO_MANY_REQUESTS',
};

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
