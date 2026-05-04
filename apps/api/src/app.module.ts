import { type DynamicModule, Module } from '@nestjs/common';
import type { Provider } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard.js';
import type { JwtService } from './common/auth/jwt.service.js';
import { DomainExceptionFilter } from './common/domain-exception.filter.js';
import { Tokens } from './composition/tokens.js';
import type { AppEnv } from './config/env.js';
import { HealthModule } from './modules/health/health.module.js';
import { IdentityAccessModule } from './modules/identity-access/identity-access.module.js';
import { ProjectManagementModule } from './modules/project-management/project-management.module.js';
import { ProviderConnectivityModule } from './modules/provider-connectivity/provider-connectivity.module.js';
import { RankTrackingModule } from './modules/rank-tracking/rank-tracking.module.js';
import { SearchConsoleInsightsModule } from './modules/search-console-insights/search-console-insights.module.js';
import { OpenApiModule } from './openapi/openapi.module.js';

@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS modules are declared as classes so that decorators can attach metadata.
export class AppModule {
	static forRoot(compositionProviders: Provider[], env: AppEnv): DynamicModule {
		const imports = [
			ThrottlerModule.forRoot({
				throttlers: [
					// Default lax throttle for the whole API; auth routes opt into a
					// stricter limit via the @Throttle decorator at the controller.
					{ name: 'default', ttl: 60_000, limit: 240 },
					{ name: 'auth', ttl: 60_000, limit: 20 },
				],
			}),
			HealthModule,
			IdentityAccessModule,
			ProjectManagementModule,
			ProviderConnectivityModule,
			RankTrackingModule,
			SearchConsoleInsightsModule,
		];
		if (env.OPENAPI_ENABLED) imports.push(OpenApiModule);

		return {
			module: AppModule,
			imports,
			providers: [
				...compositionProviders,
				{
					provide: APP_FILTER,
					useClass: DomainExceptionFilter,
				},
				{
					provide: APP_GUARD,
					inject: [Tokens.JwtService, Reflector],
					useFactory: (jwt: JwtService, reflector: Reflector) => new JwtAuthGuard(jwt, reflector),
				},
				// ThrottlerGuard runs after the auth guard so that a bad-token loop
				// also gets rate-limited.
				{
					provide: APP_GUARD,
					useClass: ThrottlerGuard,
				},
			],
			exports: [...compositionProviders.map((p) => ('provide' in p ? p.provide : p))],
			global: true,
		};
	}
}
