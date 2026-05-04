import { z } from 'zod';

const EnvSchema = z.object({
	NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
	DATABASE_URL: z.string(),
	REDIS_URL: z.string().default('redis://localhost:6379'),
	RANKPULSE_MASTER_KEY: z.string().min(16, 'RANKPULSE_MASTER_KEY must be at least 16 characters'),
	WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(4),
	DATAFORSEO_API_BASE_URL: z.string().default('https://api.dataforseo.com'),
});

export type WorkerEnv = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
	const parsed = EnvSchema.safeParse(source);
	if (!parsed.success) {
		const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
		throw new Error(`Invalid worker environment configuration:\n${issues}`);
	}
	return parsed.data;
}
