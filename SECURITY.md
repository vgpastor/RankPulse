# Security policy

## Reporting a vulnerability

Please do **not** open public GitHub issues for security vulnerabilities.

Email security reports to the maintainers via the address listed in the repository's GitHub profile. Include:

- A description of the issue and its impact.
- Steps to reproduce.
- Affected versions / commits.
- Optional: a suggested fix.

We acknowledge reports within 72 hours and aim to release a fix within 30 days for critical issues.

## Scope

In scope:

- The RankPulse codebase in this repository.
- Default Docker images published from this repository.

Out of scope:

- Third-party providers (DataForSEO, Google APIs, Ahrefs, ...).
- Self-hosted deployments where the operator has modified or misconfigured the system in ways not recommended by the documentation.

## Hardening guidelines

- Always set a strong `RANKPULSE_MASTER_KEY` (32 bytes hex) in production. This key derives the encryption keys for stored credentials.
- Restrict access to `/admin/queues` (BullBoard) to administrators only.
- Run RankPulse behind a TLS-terminating reverse proxy in production (Traefik, nginx, Caddy).
- Rotate API tokens periodically.
