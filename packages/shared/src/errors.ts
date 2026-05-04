export abstract class DomainError extends Error {
	abstract readonly code: string;

	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = this.constructor.name;
	}
}

export class InvariantViolationError extends DomainError {
	readonly code = 'INVARIANT_VIOLATION';
}

export class InvalidInputError extends DomainError {
	readonly code = 'INVALID_INPUT';
}

export class NotFoundError extends DomainError {
	readonly code = 'NOT_FOUND';
}

export class ConflictError extends DomainError {
	readonly code = 'CONFLICT';
}

export class UnauthorizedError extends DomainError {
	readonly code = 'UNAUTHORIZED';
}

export class ForbiddenError extends DomainError {
	readonly code = 'FORBIDDEN';
}
