import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import { UnauthorizedError } from '@rankpulse/shared';
import { getPrincipal } from './jwt-auth.guard.js';
import type { AuthPrincipal } from './jwt.service.js';

export const Principal = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthPrincipal => {
	const req = ctx.switchToHttp().getRequest();
	const principal = getPrincipal(req);
	if (!principal) {
		throw new UnauthorizedError('No authenticated principal on request');
	}
	return principal;
});
