# RankPulse — Production deployment runbook

Last verified: 2026-05-05 · Host: `srv07.ingenierosweb.co` (79.137.74.23)

## Topology

```
                ┌──────────────────────────────────────────────────────────┐
Internet ─────► │ Plesk nginx (TLS, Let's Encrypt R13)                     │
   :443         │  ├─ /api/*, /healthz, /readyz, /docs, /openapi.json      │
                │  │     → http://127.0.0.1:3200 (PM2 cluster, 4 workers)  │
                │  └─ /*                                                   │
                │        → static from /var/www/.../httpdocs/              │
                └───────────────────────┬──────────────────────────────────┘
                                        │
                  ┌─────────────────────┴────────────────────┐
                  │                                          │
        ┌─────────▼──────────┐                  ┌────────────▼──────────┐
        │ PM2 (host)          │                 │ Plesk Docker (host)   │
        │ user: ingenierosweb │                 │                       │
        │                     │                 │ rankpulse-postgres    │
        │ rankpulse-api ×4    │                 │   :127.0.0.1:5433     │
        │   :127.0.0.1:3200   │                 │   timescaledb-ha:pg16 │
        │   cluster mode      │ ──── pg ──────► │                       │
        │                     │                 │ rankpulse-redis       │
        │ rankpulse-worker ×1 │ ──── redis ───► │   :127.0.0.1:6379     │
        │   fork mode         │                 │   redis:7-alpine      │
        │   BullMQ            │                 │                       │
        └─────────────────────┘                 └───────────────────────┘
                  │                                          │
                  └──────────────── volumes ─────────────────┘
                                        │
                  /var/www/vhosts/ingenierosweb.co/rankpulse.ingenierosweb.co/
                  ├── app/         ← repo clone, sources, ops/
                  │   └── ops/ecosystem.config.cjs
                  ├── httpdocs/    ← Vite SPA build (Plesk docroot)
                  ├── data/
                  │   ├── postgres/   ← Docker bind mount (uid 1000)
                  │   └── redis/      ← Docker bind mount
                  ├── backups/     ← pg_dump snapshots
                  └── logs/        ← PM2 stdout/stderr
```

All paths under `/var/www/vhosts/ingenierosweb.co/rankpulse.ingenierosweb.co/`
are covered by Plesk's vhost-level backups.

## Server-side state (one-time setup, not part of CI/CD)

### Vhost user `ingenierosweb`
- uid 10000, gid 1004 (psacln), home `/var/www/vhosts/ingenierosweb.co/`
- Shell `/bin/bash` (changed from `/bin/sh` for fnm).
- SSH login enabled with the deploy key (public part in `~/.ssh/authorized_keys`).
- Private key stored in **KeePass → Hosting → "RankPulse GHA Deploy SSH Key"**.

### Node toolchain (per-user, no sudo)
- `fnm` at `~/.fnm/fnm` (downloaded from fnm.vercel.app installer).
- Node 24.15.0 selected as default (`~/.node-version` = `24`).
- `corepack enable` → pnpm 9 / 10.
- `pm2` installed globally under the user.
- All exposed via `~/.bashrc` and `~/.profile` so non-interactive SSH gets them.

### PM2 systemd unit
- `pm2 startup systemd -u ingenierosweb --hp /var/www/vhosts/ingenierosweb.co`
  was run once as root → created `/etc/systemd/system/pm2-ingenierosweb.service`.
- `systemctl is-enabled pm2-ingenierosweb` → `enabled` (boots PM2 on reboot).
- Persisted process list at `~/.pm2/dump.pm2` (re-saved with `pm2 save` after
  changes).

### Plesk Docker — Postgres + Redis
- Created via plain `docker run` with `--label managed-by=plesk-docker` so they
  appear in the Plesk Docker UI alongside any other vhost containers.
- Postgres listens on `127.0.0.1:5433` (NOT 5432 — host has its own
  PostgreSQL 17 on 5432 which we leave alone).
- Redis listens on `127.0.0.1:6379`.
- Volumes are bind-mounts to `/var/www/.../data/{postgres,redis}/` chowned to
  the in-container UIDs (1000 for postgres, 999 for redis).

To recreate either container from scratch:
```bash
# Postgres
docker run -d --name rankpulse-postgres \
    --network rankpulse-net --restart unless-stopped \
    -p 127.0.0.1:5433:5432 \
    -v /var/www/vhosts/ingenierosweb.co/rankpulse.ingenierosweb.co/data/postgres:/home/postgres/pgdata/data \
    -e POSTGRES_USER=$POSTGRES_USER \
    -e POSTGRES_PASSWORD=$POSTGRES_PASSWORD \
    -e POSTGRES_DB=$POSTGRES_DB \
    -e PGDATA=/home/postgres/pgdata/data \
    --label site=rankpulse.ingenierosweb.co \
    --label managed-by=plesk-docker \
    timescale/timescaledb-ha:pg16

# Redis
docker run -d --name rankpulse-redis \
    --network rankpulse-net --restart unless-stopped \
    -p 127.0.0.1:6379:6379 \
    -v /var/www/vhosts/ingenierosweb.co/rankpulse.ingenierosweb.co/data/redis:/data \
    --label site=rankpulse.ingenierosweb.co \
    --label managed-by=plesk-docker \
    redis:7-alpine redis-server --appendonly yes
```

### Plesk vhost docroot
- Subdomain docroot was changed via:
  ```bash
  plesk bin subdomain --update rankpulse \
      -www-root /rankpulse.ingenierosweb.co/httpdocs \
      -domain ingenierosweb.co
  ```
- Now resolves to `/var/www/vhosts/ingenierosweb.co/rankpulse.ingenierosweb.co/httpdocs/`.

### Plesk additional nginx directives
- File: `/var/www/vhosts/system/rankpulse.ingenierosweb.co/conf/vhost_nginx.conf`
  (and `vhost_ssl_nginx.conf`). Plesk auto-includes these when the file exists
  — no custom template needed.
- Applied directives:
  - `^~ /api/`, `= /healthz`, `= /readyz`, `= /openapi.json`, `^~ /docs` →
    `http://127.0.0.1:3200`
  - `^~ /assets/` → cache 1y immutable, served from httpdocs.
  - `/` → `try_files $uri $uri/ /index.html` for React Router.
- After editing the file, run `httpdmng --reconfigure-domain rankpulse.ingenierosweb.co`.

## CI/CD pipeline

`.github/workflows/release.yml` — triggers on push to `main` or
`workflow_dispatch`. Two jobs:

1. `build-web` (GHA runner, Node 24, pnpm 10):
   - `pnpm install --frozen-lockfile`
   - `pnpm --filter @rankpulse/web build`
     (`VITE_API_BASE_URL=https://rankpulse.ingenierosweb.co`)
   - Pack `apps/web/dist/` → `web-dist.tar.gz` artifact.
2. `deploy` (SSH to srv07 as `ingenierosweb`):
   - `scp web-dist.tar.gz` to vhost root.
   - `git fetch + reset --hard origin/main` in `app/`.
   - `source .env.local`.
   - `pnpm install --frozen-lockfile`.
   - `pnpm -r build` (BACKLOG #16) — turbo builds every workspace
     package + apps to `dist/` in topological order. The PM2
     ecosystem then runs `node dist/main.js` directly, no
     @swc-node/register on the prod hot path.
   - `pnpm --filter @rankpulse/infrastructure db:migrate` (Drizzle).
   - Replace `httpdocs/*` with the new bundle.
   - `pm2 reload ops/ecosystem.config.cjs --update-env`.
   - `curl --retry 8 http://127.0.0.1:3200/healthz` to gate success.

### Required GitHub Secrets / Vars

| Name | Type | Value |
|---|---|---|
| `SRV07_HOST` | secret | `79.137.74.23` |
| `SRV07_USER` | secret | `ingenierosweb` |
| `SRV07_SSH_KEY` | secret | private ed25519 (in KeePass) |
| `PUBLIC_API_BASE_URL` | variable | `https://rankpulse.ingenierosweb.co` |

## Day-2 operations

### Look at logs
```bash
# As ingenierosweb
pm2 logs                       # tail all PM2 stdout/stderr
pm2 logs rankpulse-api         # API only
pm2 logs --err                 # errors only
tail -f /var/www/vhosts/ingenierosweb.co/rankpulse.ingenierosweb.co/app/logs/api.err.log

# Storage containers
docker logs rankpulse-postgres -f
docker logs rankpulse-redis -f
```

### Restart / reload
```bash
pm2 reload all                 # zero-downtime reload (cluster takes over)
pm2 restart rankpulse-worker   # full restart of one app
docker restart rankpulse-postgres   # restart PG (data is on bind mount, persists)
```

### Apply config changes after editing `.env.local`
```bash
set -a && source .env.local && set +a
pm2 reload ops/ecosystem.config.cjs --update-env
```

### Edit env via Plesk panel
- Plesk → Files → navigate to `rankpulse.ingenierosweb.co/app/.env.local`
- Edit, save.
- SSH in or use Plesk's terminal: `pm2 reload all --update-env`.

### Migrations
```bash
cd /var/www/vhosts/ingenierosweb.co/rankpulse.ingenierosweb.co/app
set -a && source .env.local && set +a
pnpm --filter @rankpulse/infrastructure db:migrate
```

### Database backup
```bash
docker exec rankpulse-postgres pg_dump -U rankpulse -d rankpulse --clean --if-exists \
    | gzip -c \
    > /var/www/vhosts/.../backups/pg-$(date -u +%Y%m%d-%H%M%S).sql.gz
```
The backups dir is included in Plesk's vhost backups, so this snapshot
travels with the rest of the website.

### Rollback a deploy
```bash
# As ingenierosweb on srv07
cd /var/www/vhosts/ingenierosweb.co/rankpulse.ingenierosweb.co/app
git log --oneline -10
git reset --hard <prev-sha>
pnpm install --frozen-lockfile
pm2 reload ops/ecosystem.config.cjs --update-env
# If migrations need rollback, do it manually (Drizzle doesn't auto-down).
```

## Health probes

```bash
curl https://rankpulse.ingenierosweb.co/healthz
# {"status":"ok"}

curl https://rankpulse.ingenierosweb.co/readyz
# {"status":"ok","checks":{"database":"ok"}}
```

## Known operational quirks

- **Postgres on 5433, not 5432.** The host has its own PostgreSQL 17 on 5432
  (Plesk-managed, untouched). Our container is bound to 5433 via Docker
  host port. `DATABASE_URL` must include `:5433`.
- **`pm2 reload` requires env to be sourced**. The systemd unit at boot
  time loads `~/.pm2/dump.pm2` which contains the env from the last `pm2 save`.
  When you change `.env.local`, you MUST `source` and `pm2 reload --update-env`,
  otherwise PM2 keeps the old values.
- **Plesk auto-regenerates the vhost** when the panel settings change. The
  `vhost_nginx.conf` file we edit is preserved across regenerations because
  Plesk treats it as the customNginxConfigFile.
