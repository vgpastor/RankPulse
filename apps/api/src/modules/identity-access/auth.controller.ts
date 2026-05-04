import { Body, Controller, Get, HttpCode, Inject, Post, UsePipes } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { IdentityAccess as IAUseCases } from '@rankpulse/application';
import { IdentityAccessContracts } from '@rankpulse/contracts';
import type { IdentityAccess } from '@rankpulse/domain';

type RegisterOrganizationRequest = IdentityAccessContracts.RegisterOrganizationRequest;
type RegisterOrganizationResponse = IdentityAccessContracts.RegisterOrganizationResponse;
type LoginRequest = IdentityAccessContracts.LoginRequest;
type MeResponse = IdentityAccessContracts.MeResponse;

import { NotFoundError } from '@rankpulse/shared';
import type { AuthPrincipal, JwtService } from '../../common/auth/jwt.service.js';
import { Public } from '../../common/auth/jwt-auth.guard.js';
import { Principal } from '../../common/auth/principal.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { Tokens } from '../../composition/tokens.js';

interface LoginResponse {
	accessToken: string;
	expiresAt: string;
	user: { userId: string; email: string; name: string };
}

@Controller()
export class AuthController {
	constructor(
		@Inject(Tokens.RegisterOrganization) private readonly registerOrg: IAUseCases.RegisterOrganizationUseCase,
		@Inject(Tokens.AuthenticateUser) private readonly authenticate: IAUseCases.AuthenticateUserUseCase,
		@Inject(Tokens.JwtService) private readonly jwt: JwtService,
		@Inject(Tokens.UserRepository) private readonly users: IdentityAccess.UserRepository,
		@Inject(Tokens.MembershipRepository) private readonly memberships: IdentityAccess.MembershipRepository,
	) {}

	@Public()
	@Throttle({ auth: { ttl: 60_000, limit: 20 } })
	@Post('auth/register')
	@HttpCode(201)
	@UsePipes(new ZodValidationPipe(IdentityAccessContracts.RegisterOrganizationRequest))
	async register(@Body() body: RegisterOrganizationRequest): Promise<RegisterOrganizationResponse> {
		return this.registerOrg.execute(body);
	}

	@Public()
	@Throttle({ auth: { ttl: 60_000, limit: 20 } })
	@Post('auth/login')
	@HttpCode(200)
	@UsePipes(new ZodValidationPipe(IdentityAccessContracts.LoginRequest))
	async login(@Body() body: LoginRequest): Promise<LoginResponse> {
		const user = await this.authenticate.execute(body);
		const { token, expiresAt } = await this.jwt.sign({ userId: user.userId, email: user.email });
		return {
			accessToken: token,
			expiresAt: expiresAt.toISOString(),
			user,
		};
	}

	@Get('me')
	async me(@Principal() principal: AuthPrincipal): Promise<MeResponse> {
		const user = await this.users.findById(principal.userId as IdentityAccess.UserId);
		if (!user) {
			throw new NotFoundError('User no longer exists');
		}
		const memberships = await this.memberships.listForUser(principal.userId as IdentityAccess.UserId);
		return {
			userId: user.id,
			email: user.email.value,
			name: user.name,
			memberships: memberships
				.filter((m) => m.isActive())
				.map((m) => ({ organizationId: m.organizationId, role: m.role })),
		};
	}
}
