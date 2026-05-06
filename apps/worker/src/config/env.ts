import { z } from 'zod';

const EnvSchema = z.object({
	NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
	DATABASE_URL: z.string(),
	REDIS_URL: z.string().default('redis://localhost:6379'),
	RANKPULSE_MASTER_KEY: z.string().min(16, 'RANKPULSE_MASTER_KEY must be at least 16 characters'),
	WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(4),
	DATAFORSEO_API_BASE_URL: z.string().default('https://api.dataforseo.com'),
	/**
	 * Port for the worker's tiny health server (BACKLOG #21). Exposes
	 * `/healthz` (always 200 if process is up) and `/readyz` (200 only if
	 * Redis + Postgres + every BullMQ worker are running). Set to 0 to
	 * disable.
	 */
	HEALTH_PORT: z.coerce.number().int().min(0).max(65535).default(3300),
	HEALTH_HOST: z.string().default('0.0.0.0'),
	/**
	 * API key for the LLM-as-judge that extracts brand mentions from the
	 * captured LLM-search responses (sub-issue #61 / parent #27). Optional —
	 * when absent the worker persists raw responses with empty mentions and
	 * the operator gets a warning at startup.
	 */
	ANTHROPIC_API_KEY: z.string().min(20).optional(),
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
