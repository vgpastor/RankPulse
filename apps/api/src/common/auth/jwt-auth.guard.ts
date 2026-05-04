import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { UnauthorizedError } from '@rankpulse/shared';
import type { AuthPrincipal, JwtService } from './jwt.service.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Symbol used to attach the authenticated principal to the request object. */
export const PRINCIPAL_KEY = Symbol.for('rankpulse.principal');

interface RequestWithPrincipal {
	headers: Record<string, string | string[] | undefined>;
	[PRINCIPAL_KEY]?: AuthPrincipal;
}

export const getPrincipal = (req: unknown): AuthPrincipal | undefined => {
	return (req as RequestWithPrincipal)[PRINCIPAL_KEY];
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
	constructor(
		private readonly jwt: JwtService,
		private readonly reflector: Reflector,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
			context.getHandler(),
			context.getClass(),
		]);
		if (isPublic) return true;

		const req = context.switchToHttp().getRequest<RequestWithPrincipal>();
		const rawAuth = req.headers.authorization;
		const auth = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
		if (!auth || !auth.startsWith('Bearer ')) {
			throw new UnauthorizedError('Missing bearer token');
		}
		const token = auth.slice('Bearer '.length).trim();
		const principal = await this.jwt.verify(token);
		req[PRINCIPAL_KEY] = principal;
		return true;
	}
}
