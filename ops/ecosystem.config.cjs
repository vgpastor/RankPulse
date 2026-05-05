/**
 * PM2 ecosystem for RankPulse production.
 *
 * Runtime topology (host: srv07, user: ingenierosweb):
 *   - rankpulse-api    : NestJS HTTP API, cluster mode (4 workers).
 *   - rankpulse-worker : BullMQ worker, fork mode 1 instance
 *                        (BullMQ handles its own concurrency).
 *
 * BACKLOG #16 — both apps run from pre-compiled `dist/main.js` via
 * `start:prod`. Production no longer transpiles TS on the fly with
 * @swc-node/register; the deploy pipeline runs `pnpm -r build` (turbo
 * topological order) before `pm2 reload`. Saves ~1-2s of cold-start
 * per cluster worker and removes swc-node + @swc/core from the prod
 * runtime path.
 *
 * Environment variables are loaded by Node directly via `--env-file-if-exists`
 * inside each app's `start:prod` script — first .env (committed defaults)
 * then .env.local (gitignored secrets), with already-set process.env
 * winning. PM2 does NOT inject any env value beyond what the host shell
 * exports.
 *
 * Storage (managed by Plesk Docker on the same host):
 *   - rankpulse-postgres : 127.0.0.1:5433
 *   - rankpulse-redis    : 127.0.0.1:6379
 *
 * Deploy pipeline lives in .github/workflows/release.yml.
 */

const path = require('node:path');
const APP_ROOT = path.resolve(__dirname, '..');

module.exports = {
	apps: [
		{
			name: 'rankpulse-api',
			cwd: APP_ROOT,
			script: 'pnpm',
			args: ['--filter', '@rankpulse/api', 'start:prod'],
			interpreter: 'none',
			instances: 4,
			exec_mode: 'cluster',
			max_memory_restart: '512M',
			restart_delay: 4_000,
			kill_timeout: 8_000,
			out_file: path.join(APP_ROOT, 'logs/api.out.log'),
			error_file: path.join(APP_ROOT, 'logs/api.err.log'),
			merge_logs: true,
		},
		{
			name: 'rankpulse-worker',
			cwd: APP_ROOT,
			script: 'pnpm',
			args: ['--filter', '@rankpulse/worker', 'start:prod'],
			interpreter: 'none',
			instances: 1,
			exec_mode: 'fork',
			max_memory_restart: '768M',
			restart_delay: 4_000,
			kill_timeout: 8_000,
			out_file: path.join(APP_ROOT, 'logs/worker.out.log'),
			error_file: path.join(APP_ROOT, 'logs/worker.err.log'),
			merge_logs: true,
		},
	],
};
