import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { UnauthorizedError } from '@rankpulse/shared';
import type { AuthPrincipal } from './jwt.service.js';
import { getPrincipal } from './jwt-auth.guard.js';

export const Principal = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthPrincipal => {
	const req = ctx.switchToHttp().getRequest();
	const principal = getPrincipal(req);
	if (!principal) {
		throw new UnauthorizedError('No authenticated principal on request');
	}
	return principal;
});
