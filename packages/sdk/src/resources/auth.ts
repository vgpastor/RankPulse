import type { IdentityAccessContracts } from '@rankpulse/contracts';
import type { HttpClient } from '../http.js';

export interface LoginResponse {
	accessToken: string;
	expiresAt: string;
	user: { userId: string; email: string; name: string };
}

export class AuthResource {
	constructor(private readonly http: HttpClient) {}

	register(
		body: IdentityAccessContracts.RegisterOrganizationRequest,
	): Promise<IdentityAccessContracts.RegisterOrganizationResponse> {
		return this.http.post('/auth/register', body);
	}

	login(body: IdentityAccessContracts.LoginRequest): Promise<LoginResponse> {
		return this.http.post('/auth/login', body);
	}

	me(): Promise<IdentityAccessContracts.MeResponse> {
		return this.http.get('/me');
	}
}
