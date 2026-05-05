/**
 * PM2 ecosystem for RankPulse production.
 *
 * Runtime topology (host: srv07, user: ingenierosweb):
 *   - rankpulse-api    : NestJS HTTP API, cluster mode (4 workers).
 *   - rankpulse-worker : BullMQ worker, fork mode 1 instance
 *                        (BullMQ handles its own concurrency).
 *
 * BACKLOG #16 — both apps run from pre-compiled `dist/main.js`.
 * Production no longer transpiles TS on the fly with
 * @swc-node/register; the deploy pipeline runs `pnpm -r build` (turbo
 * topological order) before `pm2 reload`. Saves ~1-2s of cold-start
 * per cluster worker and removes swc-node + @swc/core from the prod
 * runtime path.
 *
 * Environment loading — PM2 cluster mode does NOT propagate
 * `--env-file-if-exists` (passed via node_args) to forked workers,
 * because cluster.fork() inherits exec args from the master only when
 * those args reach Node before PM2 hijacks the entry. Workers boot
 * with no DATABASE_URL / JWT_SECRET / RANKPULSE_MASTER_KEY and crash.
 *
 * Fix: parse `.env` (committed defaults) and `.env.local` (gitignored
 * secrets) at ecosystem-config load time using Node 22+'s built-in
 * `util.parseEnv`, merge in the precedence the user requested
 * (system env > .env.local > .env), and pass the resolved object via
 * PM2's `env` field — that PM2 *does* propagate to every worker.
 *
 * Storage (managed by Plesk Docker on the same host):
 *   - rankpulse-postgres : 127.0.0.1:5433
 *   - rankpulse-redis    : 127.0.0.1:6379
 *
 * Deploy pipeline lives in .github/workflows/release.yml.
 */

const path = require('node:path');
const fs = require('node:fs');
const util = require('node:util');

const APP_ROOT = path.resolve(__dirname, '..');

/**
 * Read an env-file at `filePath` and return its parsed key/value map.
 * Returns {} when the file does not exist (matches `--env-file-if-exists`).
 */
function readEnvFile(filePath) {
	if (!fs.existsSync(filePath)) return {};
	const raw = fs.readFileSync(filePath, 'utf8');
	// `util.parseEnv` ships with Node 22+, matches Node's own --env-file parser.
	return util.parseEnv(raw);
}

/**
 * Resolve the runtime env applying the documented precedence:
 *   process.env (host shell)  >  .env.local (secrets)  >  .env (defaults)
 * Object.assign with this order leaves the highest-precedence value in place.
 */
function resolveAppEnv() {
	const fromEnv = readEnvFile(path.join(APP_ROOT, '.env'));
	const fromEnvLocal = readEnvFile(path.join(APP_ROOT, '.env.local'));
	return Object.assign({}, fromEnv, fromEnvLocal, process.env);
}

const APP_ENV = resolveAppEnv();

const baseApp = {
	cwd: APP_ROOT,
	interpreter: 'node',
	restart_delay: 4_000,
	kill_timeout: 8_000,
	merge_logs: true,
	env: APP_ENV,
};

module.exports = {
	apps: [
		{
			...baseApp,
			name: 'rankpulse-api',
			script: 'apps/api/dist/main.js',
			instances: 4,
			exec_mode: 'cluster',
			max_memory_restart: '512M',
			out_file: path.join(APP_ROOT, 'logs/api.out.log'),
			error_file: path.join(APP_ROOT, 'logs/api.err.log'),
		},
		{
			...baseApp,
			name: 'rankpulse-worker',
			script: 'apps/worker/dist/main.js',
			instances: 1,
			exec_mode: 'fork',
			max_memory_restart: '768M',
			out_file: path.join(APP_ROOT, 'logs/worker.out.log'),
			error_file: path.join(APP_ROOT, 'logs/worker.err.log'),
		},
	],
};
