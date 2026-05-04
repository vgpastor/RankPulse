import { type DynamicModule, Module } from '@nestjs/common';
import type { Provider } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard.js';
import type { JwtService } from './common/auth/jwt.service.js';
import { DomainExceptionFilter } from './common/domain-exception.filter.js';
import { Tokens } from './composition/tokens.js';
import { HealthModule } from './modules/health/health.module.js';
import { IdentityAccessModule } from './modules/identity-access/identity-access.module.js';
import { ProjectManagementModule } from './modules/project-management/project-management.module.js';
import { ProviderConnectivityModule } from './modules/provider-connectivity/provider-connectivity.module.js';
import { RankTrackingModule } from './modules/rank-tracking/rank-tracking.module.js';
import { SearchConsoleInsightsModule } from './modules/search-console-insights/search-console-insights.module.js';

@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS modules are declared as classes so that decorators can attach metadata.
export class AppModule {
	static forRoot(compositionProviders: Provider[]): DynamicModule {
		return {
			module: AppModule,
			imports: [
				HealthModule,
				IdentityAccessModule,
				ProjectManagementModule,
				ProviderConnectivityModule,
				RankTrackingModule,
				SearchConsoleInsightsModule,
			],
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
			],
			exports: [...compositionProviders.map((p) => ('provide' in p ? p.provide : p))],
			global: true,
		};
	}
}
