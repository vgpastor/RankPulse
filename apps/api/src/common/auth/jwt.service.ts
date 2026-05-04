import { Injectable } from '@nestjs/common';
import { UnauthorizedError } from '@rankpulse/shared';
import { type JWTPayload, jwtVerify, SignJWT } from 'jose';

export interface AuthPrincipal {
	userId: string;
	email: string;
}

const ISSUER = 'rankpulse';
const AUDIENCE = 'rankpulse-api';

@Injectable()
export class JwtService {
	private readonly secret: Uint8Array;
	private readonly ttlSeconds: number;

	constructor(rawSecret: string, ttlSeconds: number) {
		this.secret = new TextEncoder().encode(rawSecret);
		this.ttlSeconds = ttlSeconds;
	}

	async sign(principal: AuthPrincipal): Promise<{ token: string; expiresAt: Date }> {
		const issuedAt = Math.floor(Date.now() / 1000);
		const expiresAtSec = issuedAt + this.ttlSeconds;
		const token = await new SignJWT({ email: principal.email })
			.setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
			.setSubject(principal.userId)
			.setIssuer(ISSUER)
			.setAudience(AUDIENCE)
			.setIssuedAt(issuedAt)
			.setExpirationTime(expiresAtSec)
			.sign(this.secret);
		return { token, expiresAt: new Date(expiresAtSec * 1000) };
	}

	async verify(token: string): Promise<AuthPrincipal> {
		try {
			const { payload } = await jwtVerify<JWTPayload & { email: string }>(token, this.secret, {
				issuer: ISSUER,
				audience: AUDIENCE,
			});
			if (!payload.sub || !payload.email) {
				throw new UnauthorizedError('Token missing required claims');
			}
			return { userId: payload.sub, email: payload.email };
		} catch (err) {
			if (err instanceof UnauthorizedError) throw err;
			throw new UnauthorizedError('Invalid or expired session token');
		}
	}
}
