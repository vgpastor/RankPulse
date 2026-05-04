/**
 * RFC 7807 Problem Details payload returned by the API for any error.
 * Mirrors @rankpulse/contracts ProblemDetails so consumers can `instanceof`
 * check without depending on Zod.
 */
export interface ProblemDetailsPayload {
	type: string;
	title: string;
	status: number;
	detail?: string;
	code?: string;
	instance?: string;
	[k: string]: unknown;
}

export class RankPulseApiError extends Error {
	readonly status: number;
	readonly code?: string;
	readonly problem: ProblemDetailsPayload;

	constructor(problem: ProblemDetailsPayload) {
		super(problem.detail ?? problem.title);
		this.name = 'RankPulseApiError';
		this.status = problem.status;
		this.code = problem.code;
		this.problem = problem;
	}

	isCode(code: string): boolean {
		return this.code === code;
	}
}

export class RankPulseNetworkError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'RankPulseNetworkError';
	}
}
