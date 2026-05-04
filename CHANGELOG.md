# Changelog

All notable changes to this project will be documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Monorepo bootstrap: pnpm workspaces, Turborepo, Biome, base TypeScript configuration.
- Documentation scaffolding: README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT.
- AGPL-3.0 license.
- Development docker-compose with Postgres + TimescaleDB and Redis.
- `packages/shared`: `Result`, `Either`, identifiers, `Clock` port, error hierarchy.
- `identity-access` bounded context: `Organization`, `User`, `Membership`, `ApiToken` aggregates with value objects, domain events and ports.
- `project-management` bounded context: `Portfolio`, `Project`, `Domain`, `KeywordList`, `Competitor` aggregates with value objects, domain events and ports.
- Application use cases for both contexts with unit tests that mock only at port boundaries.
- `packages/testing`: in-memory port adapters and aggregate factories.
