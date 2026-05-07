# Recipe: Adding a new provider

> **Status:** ADR 0002 (Provider Extension Platform) Phase 3 landed (2026-05-07).
> Manifests are the official pattern; the legacy `Provider` interface is
> deprecated and slated for deletion in Phase 7.
> See [`docs/adr/0002-provider-extension-platform.md`](../adr/0002-provider-extension-platform.md)
> for the full rationale.

This recipe walks through adding a brand-new external provider to RankPulse.
The 14 existing providers in `packages/providers/*` are real templates —
pick the closest one to your auth model and copy.

## 0. Pre-flight

- Open or claim a GitHub issue with labels `provider` + `free-source` or
  `paid-source` (see CLAUDE.md § 9 "Claim de issues").
- Check whether your data is **multi-scope shareable** (org → portfolio →
  project → domain). If yes, no extra work — `ResolveProviderCredentialUseCase`
  already cascades.

## 1. Create the package

```bash
mkdir -p packages/providers/<name>/src/{endpoints,acl}
cd packages/providers/<name>
```

Add `package.json`:

```json
{
  "name": "@rankpulse/provider-<name>",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests",
    "clean": "rm -rf dist .turbo *.tsbuildinfo"
  },
  "dependencies": {
    "@rankpulse/provider-core": "workspace:*",
    "@rankpulse/shared": "workspace:*",
    "zod": "catalog:"
  },
  "devDependencies": { "typescript": "catalog:", "vitest": "catalog:" }
}
```

Mirror an existing provider's `tsconfig.json` and `tsconfig.build.json`.

## 2. Pick the auth strategy

`AuthStrategy` (in `@rankpulse/provider-core/manifest`) is a discriminated
union. Pick one:

| Auth model | `AuthStrategy.kind` | Provider examples |
|---|---|---|
| `Authorization: Bearer <key>` | `'bearer-token'` | Clarity, OpenAI, Perplexity, Cloudflare Radar |
| `<HeaderName>: <key>` | `'api-key-header'` (with `headerName`) | Anthropic (`x-api-key`), Brevo (`api-key`), Google AI Studio (`x-goog-api-key`) |
| Basic auth (`username:password`) | `'basic'` | DataForSEO (with override for pipe-separated) |
| Service Account JWT mint | `'service-account-jwt'` | GSC, GA4 |
| Either API key OR SA JWT | `'api-key-or-service-account-jwt'` | PageSpeed |
| Custom (e.g. query-string token, no auth) | `'custom'` (with `sign(req, secret)` for future-compat) | Bing (`?apikey=`), Meta (`?access_token=`), Wikipedia (no-op) |

The default `BaseHttpClient.applyAuth` covers `bearer-token`,
`api-key-header`, `basic`, `oauth-token` automatically. The other kinds
require overriding `request<T>` in your client. See `BaseHttpClient` in
`packages/providers/core/src/http-base.ts`.

## 3. Write the HTTP client (`src/http.ts`)

Skeleton:

```typescript
import type { FetchContext } from '@rankpulse/provider-core';
import { BaseHttpClient, type HttpConfig, ProviderApiError } from '@rankpulse/provider-core';

const PROVIDER_ID = '<name>';
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

function composeSignals(...signals: ReadonlyArray<AbortSignal | undefined>): AbortSignal {
  // Duplicate this helper from the existing providers — `BaseHttpClient`
  // keeps it private. Tracked as a follow-up to expose it.
}

export class XHttpClient extends BaseHttpClient {
  private readonly fetchImpl: typeof fetch;

  constructor(config: HttpConfig, options: { fetchImpl?: typeof fetch } = {}) {
    super(PROVIDER_ID, config);
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  protected override async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    query: Record<string, string>,
    body: unknown,
    ctx: FetchContext,
  ): Promise<T> {
    // Build URL, compose signal, get auth headers (call this.applyAuth
    // if your auth.kind is one the parent handles; otherwise emit
    // headers/URL params yourself), fetch, enforce body cap, parse,
    // wrap errors as ProviderApiError. ~50 LOC.
  }
}

// Backward-compat alias so callers checking `instanceof XApiError` keep
// working when the new client throws ProviderApiError.
export const XApiError = ProviderApiError;
export type XApiError = ProviderApiError;

// Adapter so existing helpers (which take a legacy `XHttp` shape) can
// route through the new client during the Phase 5+ activation period.
export const buildLegacyShim = (client: XHttpClient, ctx: FetchContext): XHttp =>
  ({ /* delegate to client.{get,post,...}(path, query, ctx) */ }) as XHttp;
```

## 4. Write the endpoints (`src/endpoints/<name>.ts`)

For each endpoint, export a `descriptor: EndpointDescriptor` (from
`@rankpulse/provider-core/types`) with:

- `id` (kebab-case, globally unique — e.g. `gsc-search-analytics`).
- `category` (`'rankings' | 'brand' | 'onpage'`).
- `displayName`, `description`.
- `paramsSchema`: a Zod schema for validation. Use
  `DATE_OR_TOKEN_REGEX` from `@rankpulse/shared` for fields that accept
  `{{today-N}}` token resolution (BACKLOG #22).
- `cost: { unit: 'usd_cents', amount: <worst-case-per-call> }`.
- `defaultCron` (UTC).
- `rateLimit: { max, durationMs }`.

Plus a `fetchX(http, params, ctx)` helper that does the actual HTTP call.

## 5. Write the ACL (`src/acl/<name>.acl.ts`)

Pure transformation: provider response → array of normalized rows. Only
relevant if the endpoint has an ingest binding. The function signature
must match `(response: TResponse, params?: Pick<TParams, ...>) => unknown[]`.
ACLs that return a single object (e.g. snapshot per call) wrap the result
in a single-element array — the manifest's `IngestBinding.acl` contract
returns `unknown[]`.

## 6. Write the manifest (`src/manifest.ts`)

```typescript
const auth: AuthStrategy = { kind: '<your-kind>' /* …extra fields… */ };

const adapt =
  <TParams, TResponse>(helper: (http: XHttp, params: TParams, ctx: FetchContext) => Promise<TResponse>):
    EndpointManifest<unknown, unknown>['fetch'] =>
  async (http, params, ctx) => {
    const shim = buildLegacyShim(http as XHttpClient, ctx);
    return helper(shim, params as TParams, ctx);
  };

const myIngest: IngestBinding<TResponse> = {
  useCaseKey: '<bounded-context>:<use-case-name>',
  systemParamKey: '<entityIdField>',
  acl: (response, ctx) => extractRows(response /* + ctx.dateBucket / endpointParams as needed */),
};

export const xProviderManifest: ProviderManifest = {
  id: '<name>',
  displayName: 'Display Name',
  http: { baseUrl: '...', auth, defaultTimeoutMs: 60_000 },
  validateCredentialPlaintext(plaintextSecret) { /* throws InvalidInputError on bad shape */ },
  endpoints: [
    { descriptor, fetch: adapt(fetchX), ingest: myIngest as IngestBinding },
  ],
  // Optional: only override if quota signals on codes other than 429
  isQuotaExhausted(error) {
    return error instanceof ProviderApiError && (error.status === 402 || error.status === 429);
  },
};
```

## 7. Tests (`src/http.spec.ts`)

Mirror an existing provider's spec. Cover:

- Successful request emits the right auth headers / URL params.
- Non-OK status throws `ProviderApiError` with status preserved (and
  satisfies `instanceof XApiError` via the alias).
- Network failure → status 0.
- Body cap rejection (`content-length` over the limit).
- `validateCredentialPlaintext` rejects malformed secrets BEFORE any
  network call.

## 8. Wire up the package barrel

```typescript
// src/index.ts
export * from './acl/<name>.acl.js';
export * from './credential.js';
export * from './endpoints/<name>.js';
export * from './http.js';
export * from './manifest.js';
export * from './provider.js'; // legacy class, still exported until Phase 7
```

## 9. Verify

```bash
pnpm --filter @rankpulse/provider-<name> typecheck
pnpm --filter @rankpulse/provider-<name> test
pnpm typecheck                                          # full workspace
```

## 10. Wire into the apps

> **Phase 5+ activation in progress.** Until the IngestRouter goes live,
> the worker still dispatches via `apps/worker/src/processors/provider-fetch.processor.ts`'s
> if-else chain. Add your provider/endpoint dispatch block there following
> the existing pattern.

After Phase 5 lands: just register your manifest in `apps/api/src/composition/composition-root.ts`
and `apps/worker/src/main.ts`'s manifest array. The IngestRouter will pick
up the binding and dispatch automatically. **No worker code changes required.**

## 11. Open the PR

- Title: `feat(provider-<name>): manifest + BaseHttpClient migration (ADR 0002)`
  if migrating; just `feat(provider-<name>): ...` for net-new.
- Reference the issue with `Closes #N`.
- Include test counts in the PR description.
