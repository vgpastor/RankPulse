import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
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

	app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: false }));

	if (env.CORS_ORIGINS) {
		app.enableCors({
			origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
			credentials: true,
		});
	}

	if (env.OPENAPI_ENABLED) {
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
