/**
 * PM2 ecosystem for RankPulse production.
 *
 * Runtime topology (host: srv07, user: ingenierosweb):
 *   - rankpulse-api    : NestJS HTTP API, cluster mode (4 workers).
 *                        Plesk nginx reverse-proxies /api/*, /healthz,
 *                        /readyz, /docs, /openapi.json -> 127.0.0.1:3200.
 *   - rankpulse-worker : BullMQ worker, fork mode 1 instance
 *                        (BullMQ handles its own concurrency via
 *                        WORKER_CONCURRENCY env var).
 *
 * Both apps run via `tsx` against the workspace sources (same approach
 * as the previous Docker images — see BACKLOG #16 for the planned
 * migration to a `tsc` -> `dist/` pipeline).
 *
 * Storage stays in Docker (managed by Plesk Docker on the same host):
 *   - rankpulse-postgres : 127.0.0.1:5432
 *   - rankpulse-redis    : 127.0.0.1:6379
 *
 * Deployment pulls the repo to:
 *   /var/www/vhosts/ingenierosweb.co/rankpulse.ingenierosweb.co/app
 * and runs:
 *   pnpm install --frozen-lockfile
 *   pnpm --filter @rankpulse/infrastructure db:migrate
 *   pm2 reload ecosystem.config.cjs --update-env
 */

const path = require('node:path');
const APP_ROOT = path.resolve(__dirname, '..');

const sharedEnv = {
	NODE_ENV: 'production',
	// All service URLs are localhost — Postgres/Redis are bound to
	// 127.0.0.1 by the Plesk-managed Docker containers, the api/worker
	// processes are host-side via PM2.
	DATABASE_URL: process.env.DATABASE_URL,
	REDIS_URL: process.env.REDIS_URL,
	RANKPULSE_MASTER_KEY: process.env.RANKPULSE_MASTER_KEY,
	JWT_SECRET: process.env.JWT_SECRET,
	JWT_TTL_SECONDS: '86400',
	LOG_LEVEL: process.env.LOG_LEVEL,
};

module.exports = {
	apps: [
		{
			name: 'rankpulse-api',
			cwd: APP_ROOT,
			script: 'pnpm',
			args: ['--filter', '@rankpulse/api', 'start'],
			interpreter: 'none',
			instances: 4,
			exec_mode: 'cluster',
			max_memory_restart: '512M',
			restart_delay: 4_000,
			kill_timeout: 8_000,
			env: {
				...sharedEnv,
				PORT: '3200',
				HOST: '127.0.0.1',
				CORS_ORIGINS: process.env.CORS_ORIGINS,
				OPENAPI_ENABLED: 'true',
			},
			out_file: path.join(APP_ROOT, 'logs/api.out.log'),
			error_file: path.join(APP_ROOT, 'logs/api.err.log'),
			merge_logs: true,
		},
		{
			name: 'rankpulse-worker',
			cwd: APP_ROOT,
			script: 'pnpm',
			args: ['--filter', '@rankpulse/worker', 'start'],
			interpreter: 'none',
			instances: 1,
			exec_mode: 'fork',
			max_memory_restart: '768M',
			restart_delay: 4_000,
			kill_timeout: 8_000,
			env: {
				...sharedEnv,
				WORKER_CONCURRENCY: process.env.WORKER_CONCURRENCY,
				HEALTH_PORT: '3300',
				HEALTH_HOST: '127.0.0.1',
			},
			out_file: path.join(APP_ROOT, 'logs/worker.out.log'),
			error_file: path.join(APP_ROOT, 'logs/worker.err.log'),
			merge_logs: true,
		},
	],
};
