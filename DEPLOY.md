# RankPulse deployment guide

This document describes the production deployment pipeline. The pipeline is
fully automated: every push to `main` lands in production within ~3-5 minutes.

## Topology

```
GitHub push (main)
   │
   ▼
GitHub Actions (.github/workflows/release.yml)
   ├─ Build api / worker / web Docker images in parallel
   ├─ Push to ghcr.io/vgpastor/rankpulse-{api,worker,web}:latest + :sha-<short>
   └─ SSH into srv07 → git pull + docker compose pull + run migrations + up -d
   │
   ▼
srv07.ingenierosweb.co (79.137.74.23)
   ├─ Containers (bound to 127.0.0.1):
   │     ├─ rankpulse-api      :3200  → NestJS API
   │     ├─ rankpulse-web      :3201  → React SPA (nginx)
   │     ├─ rankpulse-worker   (no port) BullMQ worker
   │     ├─ rankpulse-postgres (internal) TimescaleDB
   │     └─ rankpulse-redis    (internal) BullMQ + cache
   │
   └─ Plesk Nginx (vhost rankpulse.ingenierosweb.co)
         ├─ TLS termination (Let's Encrypt)
         └─ Reverse proxy: /api/* → :3200, / → :3201
```

## One-time setup

Performed already by Claude during the initial deployment session:

1. SSH deploy key generated on srv07 → public part appended to
   `/root/.ssh/authorized_keys`. Private part stored as `SRV07_SSH_KEY` GitHub
   secret.
2. `/opt/RankPulse/.env` populated with strong secrets (see
   `.env.production.example` for the template).
3. `docker-compose.prod.yml` placed at `/opt/RankPulse/docker-compose.prod.yml`.
4. Plesk Nginx vhost configured with the reverse-proxy snippet from
   `docker/nginx/plesk.snippet.conf`.

### GitHub repository configuration

In the GitHub repo settings:

1. **Settings → Secrets and variables → Actions → Secrets**:

   | Name              | Value                                            |
   | ----------------- | ------------------------------------------------ |
   | `SRV07_HOST`      | `79.137.74.23`                                   |
   | `SRV07_USER`      | `root` (or dedicated deploy user)                |
   | `SRV07_SSH_KEY`   | Private part of the deploy keypair (PEM format)  |
   | `GHCR_USER`       | `vgpastor`                                       |
   | `GHCR_TOKEN`      | A GitHub PAT with `read:packages` scope          |

2. **Settings → Secrets and variables → Actions → Variables** (optional):

   | Name                    | Value                                          |
   | ----------------------- | ---------------------------------------------- |
   | `PUBLIC_API_BASE_URL`   | `https://rankpulse.ingenierosweb.co/api/v1`    |

3. **Settings → Environments → New environment** named `production`:
   - Optionally require manual approval before deploy.

4. **Settings → Actions → General → Workflow permissions**:
   - Set to "Read and write permissions" so the workflow can publish to GHCR.

## Manual steps the user must perform

### 1. DNS A record (Cloudflare)

In your Cloudflare dashboard for `ingenierosweb.co`:

| Type | Name        | Content       | Proxy status |
| ---- | ----------- | ------------- | ------------ |
| `A`  | `rankpulse` | `79.137.74.23`| DNS only (gray cloud) — needed so Let's Encrypt validation reaches Plesk. After SSL is issued you can switch to "Proxied" if you want CDN. |

### 2. Issue Let's Encrypt certificate (Plesk)

Once DNS resolves, in Plesk:

1. Domains → `rankpulse.ingenierosweb.co` → SSL/TLS Certificates → Install free
   basic certificate by Let's Encrypt.
2. Tick "Secure the wildcard domain" only if you have a wildcard cert already.
3. Apply.

### 3. (Optional) GSC service account

If you want the GSC provider live, drop the JSON key for
`claude-access@ingenierosweb.iam.gserviceaccount.com` into:

```
/opt/RankPulse/config/gsc-service-account.json
```

The DataForSEO provider works without this.

## Triggering a deploy

Any push to `main` triggers the full pipeline. To re-deploy without code
changes use **Actions → Release → Run workflow** in the GitHub UI.

## Rollback

To pin to a previous build:

```bash
ssh root@79.137.74.23
cd /opt/RankPulse
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=sha-abc1234/' .env  # past commit short SHA
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Set `IMAGE_TAG=latest` again after recovering.

## Health & observability

```bash
# API liveness
curl -s https://rankpulse.ingenierosweb.co/healthz | jq

# API readiness (database probe)
curl -s https://rankpulse.ingenierosweb.co/readyz | jq

# Worker logs
ssh root@79.137.74.23 docker logs -f rankpulse-worker

# OpenAPI explorer
open https://rankpulse.ingenierosweb.co/docs
```
