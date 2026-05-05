# ops/

Infrastructure-as-code artifacts for RankPulse production.

| File | Purpose |
|---|---|
| [`ecosystem.config.cjs`](./ecosystem.config.cjs) | PM2 process definitions (api cluster + worker fork). Loaded by GHA on every deploy via `pm2 reload`. |
| [`DEPLOY.md`](./DEPLOY.md) | Production deployment runbook — topology, server-side setup, day-2 operations. |

The runtime topology is documented in `DEPLOY.md`.
