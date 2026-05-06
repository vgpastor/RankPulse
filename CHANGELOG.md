# Changelog

All notable changes to this project will be documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Meta provider (`@rankpulse/provider-meta`) and `meta-ads-attribution` bounded context (#45). Three endpoints — `meta-pixel-events-stats` (daily Meta Pixel events), `meta-ads-insights` (campaign / adset / ad daily insights with conversion roll-ups), `meta-custom-audiences` (weekly inventory). Two new hypertables: `meta_pixel_events_daily(meta_pixel_id, observed_date, event_name, event_count, value_sum)` and `meta_ads_insights_daily(meta_ad_account_id, observed_date, level, entity_id, impressions, clicks, spend, conversions)`. Link/unlink + history endpoints exposed on `POST/DELETE /projects/:id/meta/{pixels,ad-accounts}` and `GET /meta/{pixels,ad-accounts}/:id/{events,insights}`.
- Monorepo bootstrap: pnpm workspaces, Turborepo, Biome, base TypeScript configuration.
- Documentation scaffolding: README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT.
- AGPL-3.0 license.
- Development docker-compose with Postgres + TimescaleDB and Redis.
- `packages/shared`: `Result`, `Either`, identifiers, `Clock` port, error hierarchy.
- `identity-access` bounded context: `Organization`, `User`, `Membership`, `ApiToken` aggregates with value objects, domain events and ports.
- `project-management` bounded context: `Portfolio`, `Project`, `Domain`, `KeywordList`, `Competitor` aggregates with value objects, domain events and ports.
- Application use cases for both contexts with unit tests that mock only at port boundaries.
- `packages/testing`: in-memory port adapters and aggregate factories.
