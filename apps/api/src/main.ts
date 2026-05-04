import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { buildCompositionRoot } from './composition/composition-root.js';
import { loadEnv } from './config/env.js';

async function bootstrap(): Promise<void> {
	const env = loadEnv();
	const composition = buildCompositionRoot(env);
	const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(composition.providers), {
		logger: env.NODE_ENV === 'production' ? ['log', 'warn', 'error'] : ['debug', 'log', 'warn', 'error'],
	});

	app.setGlobalPrefix('api/v1', {
		exclude: [
			{ path: 'healthz', method: 0 as const },
			{ path: 'readyz', method: 0 as const },
			{ path: 'docs', method: 0 as const },
			{ path: 'openapi.json', method: 0 as const },
		],
	});

	// Validation is performed per-route via `ZodValidationPipe(schema)` driven by
	// @rankpulse/contracts schemas, so we deliberately skip the class-validator
	// global pipe to avoid a runtime dependency on a package we don't use.

	if (env.CORS_ORIGINS) {
		app.enableCors({
			origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
			credentials: true,
		});
	}

	let openapiMounted = false;
	if (env.OPENAPI_ENABLED) {
		try {
			const docConfig = new DocumentBuilder()
				.setTitle('RankPulse API')
				.setDescription(
					'Open-source self-hosted SEO intelligence platform — REST API for projects, providers, metrics, alerts and reporting.',
				)
				.setVersion('0.1.0')
				.addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
				.addServer('/')
				.build();
			const document = SwaggerModule.createDocument(app, docConfig);
			SwaggerModule.setup('docs', app, document, {
				useGlobalPrefix: false,
				jsonDocumentUrl: '/openapi.json',
			});
			openapiMounted = true;
		} catch (err) {
			// @nestjs/swagger 8 needs `design:paramtypes` metadata which the dev
			// runtime (tsx/esbuild) does not always emit for parameters typed as
			// Zod-derived type aliases. We log and keep serving — the rest of the
			// API is unaffected. Tracked as TODO in README.
			Logger.warn(
				`OpenAPI document generation failed (${err instanceof Error ? err.message : String(err)}); /docs and /openapi.json will not be served.`,
				'Bootstrap',
			);
		}
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
	if (openapiMounted) {
		Logger.log(`OpenAPI docs at http://${env.HOST}:${env.PORT}/docs (json: /openapi.json)`, 'Bootstrap');
	}
}

bootstrap().catch((err) => {
	// eslint-disable-next-line no-console
	console.error('Fatal: failed to start API', err);
	process.exit(1);
});
