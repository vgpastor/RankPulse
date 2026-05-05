import { createServer, type Server } from 'node:http';
import type { Worker } from 'bullmq';

export interface HealthServerDeps {
	/** Returns the connection check result; throws on failure. */
	pingPostgres: () => Promise<void>;
	pingRedis: () => Promise<void>;
	workers: readonly Worker[];
	logger: { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void };
}

export interface HealthServer {
	listen(port: number, host: string): Promise<void>;
	close(): Promise<void>;
}

/**
 * Minimal HTTP server for the worker (BACKLOG #21). Two endpoints:
 *
 *   GET /healthz  → 200 always (process alive). Used by docker compose
 *                   healthchecks and orchestrators that just want to know
 *                   the container is running.
 *   GET /readyz   → 200 only if Postgres + Redis are reachable AND every
 *                   BullMQ worker is `running` (not paused/closed/closing).
 *                   503 with `{ ok: false, checks: {...} }` otherwise.
 *
 * No NestJS — a 30-line `http.createServer` is plenty for two endpoints, and
 * keeps the worker boot path off the framework critical path.
 */
export const createHealthServer = (deps: HealthServerDeps): HealthServer => {
	let server: Server | null = null;

	const checkReadiness = async (): Promise<{ ok: boolean; checks: Record<string, 'ok' | 'failing'> }> => {
		const checks: Record<string, 'ok' | 'failing'> = {};

		try {
			await deps.pingPostgres();
			checks.postgres = 'ok';
		} catch {
			checks.postgres = 'failing';
		}

		try {
			await deps.pingRedis();
			checks.redis = 'ok';
		} catch {
			checks.redis = 'failing';
		}

		// BullMQ Worker is "running" if it has been started and not closed.
		// `worker.isRunning()` returns true even when paused — for our health
		// purposes paused = unhealthy too, so we also gate on `isPaused()`.
		const allWorkersRunning = deps.workers.every((w) => w.isRunning() && !w.isPaused());
		checks.workers = allWorkersRunning ? 'ok' : 'failing';

		const ok = Object.values(checks).every((v) => v === 'ok');
		return { ok, checks };
	};

	return {
		async listen(port, host) {
			if (port === 0) {
				deps.logger.info({}, 'health server disabled (HEALTH_PORT=0)');
				return;
			}
			server = createServer((req, res) => {
				const url = req.url ?? '';
				if (url === '/healthz') {
					res.writeHead(200, { 'content-type': 'application/json' });
					res.end(JSON.stringify({ ok: true }));
					return;
				}
				if (url === '/readyz') {
					checkReadiness()
						.then((result) => {
							res.writeHead(result.ok ? 200 : 503, { 'content-type': 'application/json' });
							res.end(JSON.stringify(result));
						})
						.catch((err) => {
							res.writeHead(500, { 'content-type': 'application/json' });
							res.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'unknown' }));
						});
					return;
				}
				res.writeHead(404, { 'content-type': 'application/json' });
				res.end(JSON.stringify({ ok: false, error: 'not found' }));
			});

			await new Promise<void>((resolve, reject) => {
				server?.once('error', reject);
				server?.listen(port, host, () => {
					server?.off('error', reject);
					resolve();
				});
			});
			deps.logger.info({ port, host }, 'worker health server listening');
		},
		async close() {
			if (!server) return;
			await new Promise<void>((resolve, reject) => {
				server?.close((err) => (err ? reject(err) : resolve()));
			});
			server = null;
		},
	};
};
