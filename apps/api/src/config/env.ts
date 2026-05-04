import { z } from 'zod';

const EnvSchema = z.object({
	NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
	PORT: z.coerce.number().int().min(1).max(65535).default(3000),
	HOST: z.string().default('0.0.0.0'),
	DATABASE_URL: z
		.string()
		.url()
		.or(z.string().startsWith('postgres://'))
		.or(z.string().startsWith('postgresql://')),
	JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
	JWT_TTL_SECONDS: z.coerce
		.number()
		.int()
		.min(60)
		.default(60 * 60 * 24),
	CORS_ORIGINS: z.string().optional(),
	OPENAPI_ENABLED: z
		.string()
		.optional()
		.transform((v) => v !== 'false'),
});

export type AppEnv = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
	const parsed = EnvSchema.safeParse(source);
	if (!parsed.success) {
		const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
		throw new Error(`Invalid environment configuration:\n${issues}`);
	}
	return parsed.data;
}
