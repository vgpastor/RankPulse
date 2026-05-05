import type { Provider } from '@nestjs/common';
import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { JwtService } from './common/auth/jwt.service.js';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard.js';
import { DomainExceptionFilter } from './common/domain-exception.filter.js';
import { Tokens } from './composition/tokens.js';
import type { AppEnv } from './config/env.js';
import { EntityAwarenessModule } from './modules/entity-awareness/entity-awareness.module.js';
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
					// Default throttle for read-heavy endpoints; the dashboard
					// polls several queries on every page so 600/min (10/s) is
					// the comfortable floor for a single human session.
					{ name: 'default', ttl: 60_000, limit: 600 },
					// Auth routes use a much stricter limit to slow brute force.
					{ name: 'auth', ttl: 60_000, limit: 20 },
					// Admin bulk-writes (BACKLOG #23): legitimate operator setup
					// (curl/SDK scripts importing 2000 keywords + competitors)
					// hit hundreds of rapid POSTs. The endpoints opt into this
					// throttle via @Throttle({ bulk: ... }) — see project /
					// rank-tracking controllers.
					{ name: 'bulk', ttl: 60_000, limit: 6_000 },
				],
			}),
			HealthModule,
			IdentityAccessModule,
			ProjectManagementModule,
			ProviderConnectivityModule,
			RankTrackingModule,
			SearchConsoleInsightsModule,
			EntityAwarenessModule,
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
