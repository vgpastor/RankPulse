import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { buildCompositionRoot } from './composition/composition-root.js';
import { loadEnv } from './config/env.js';

async function bootstrap(): Promise<void> {
	const env = loadEnv();
	const composition = buildCompositionRoot(env);
	const app = await NestFactory.create<NestExpressApplication>(
		AppModule.forRoot(composition.providers, env),
		{
			logger: env.NODE_ENV === 'production' ? ['log', 'warn', 'error'] : ['debug', 'log', 'warn', 'error'],
		},
	);

	app.use(
		helmet({
			// Swagger UI loads its assets from a CDN, so we relax CSP only for
			// /docs. The HTML we serve already names a single trusted CDN host.
			contentSecurityPolicy: env.OPENAPI_ENABLED
				? {
						directives: {
							defaultSrc: ["'self'"],
							scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
							styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
							imgSrc: ["'self'", 'data:', 'https://cdn.jsdelivr.net'],
							connectSrc: ["'self'"],
							fontSrc: ["'self'", 'https://cdn.jsdelivr.net'],
						},
					}
				: undefined,
			crossOriginResourcePolicy: { policy: 'cross-origin' },
		}),
	);

	app.setGlobalPrefix('api/v1', {
		exclude: [
			{ path: 'healthz', method: 0 as const },
			{ path: 'readyz', method: 0 as const },
			{ path: 'docs', method: 0 as const },
			{ path: 'openapi.json', method: 0 as const },
		],
	});

	if (env.CORS_ORIGINS) {
		app.enableCors({
			origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
			credentials: true,
		});
	}

	app.enableShutdownHooks();
	app.enableVersioning();

	const stop = async (): Promise<void> => {
		Logger.log('Shutting down...', 'Bootstrap');
		await app.close();
		await composition.close();
	};
	process.once('SIGTERM', stop);
	process.once('SIGINT', stop);

	await app.listen(env.PORT, env.HOST);
	Logger.log(`RankPulse API listening on http://${env.HOST}:${env.PORT}`, 'Bootstrap');
	if (env.OPENAPI_ENABLED) {
		Logger.log(`OpenAPI docs at http://${env.HOST}:${env.PORT}/docs (json: /openapi.json)`, 'Bootstrap');
	}
}

bootstrap().catch((err) => {
	// eslint-disable-next-line no-console
	console.error('Fatal: failed to start API', err);
	process.exit(1);
});
