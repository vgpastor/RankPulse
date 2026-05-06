import type { EndpointDescriptor, FetchContext } from './types.js';

/**
 * Pure-data declaration of a provider. Replaces the `Provider` interface
 * (deprecated; deleted in Phase 7). Lives in each provider package's
 * `manifest.ts` and is exported as a value (not a class) so iteration and
 * inspection are trivial.
 *
 * See ADR 0002 for the rationale of choosing data-driven manifests over
 * class-based provider implementations.
 */
export interface ProviderManifest {
	readonly id: string;
	readonly displayName: string;
	readonly http: HttpConfig;
	readonly endpoints: readonly EndpointManifest[];
	/**
	 * Per-provider credential format check, called by
	 * RegisterProviderCredentialUseCase before encrypting and persisting.
	 * Throws InvalidInputError on format mismatch. Returning normally means
	 * the format is acceptable; it does NOT prove the secret is authorised.
	 */
	validateCredentialPlaintext(plaintextSecret: string): void;
	/**
	 * Optional override for quota detection. Most providers signal quota
	 * exhaustion via 429 / 402 (the default in `isQuotaExhaustedError`). A
	 * provider that uses a different signal (e.g. 401 = "key revoked, must
	 * re-link") implements this hook. Returns true if the error should
	 * auto-pause the JobDefinition.
	 */
	readonly isQuotaExhausted?: (error: unknown) => boolean;
	/**
	 * Factory that builds the provider's HttpClient from `manifest.http`.
	 * The composition root calls this once per manifest at boot to seed
	 * the `ManifestProviderRegistry`; the resulting client is reused
	 * across every endpoint fetch for that provider.
	 *
	 * Each provider package exports its own `XHttpClient` subclass of
	 * `BaseHttpClient` (with auth and body-cap overrides as needed); the
	 * factory just wraps `new XHttpClient(http)`. Lives on the manifest
	 * (not as a class) so the manifest stays a self-contained
	 * declaration that can be consumed without importing the class.
	 */
	readonly buildHttpClient: (http: HttpConfig) => HttpClient;
}

export interface HttpConfig {
	readonly baseUrl: string;
	readonly auth: AuthStrategy;
	readonly defaultTimeoutMs?: number;
	readonly defaultRetries?: number;
}

export type AuthStrategy =
	| { readonly kind: 'bearer-token' }
	| { readonly kind: 'api-key-header'; readonly headerName: string }
	| { readonly kind: 'basic' }
	| { readonly kind: 'oauth-token' }
	| { readonly kind: 'service-account-jwt' }
	| { readonly kind: 'api-key-or-service-account-jwt' }
	| {
			readonly kind: 'custom';
			readonly sign: (req: HttpRequest, plaintextSecret: string) => HttpRequest;
	  };

export interface HttpRequest {
	readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
	readonly url: string;
	readonly headers: Record<string, string>;
	readonly body?: unknown;
}

export interface EndpointManifest<TParams = unknown, TResponse = unknown> {
	readonly descriptor: EndpointDescriptor;
	readonly fetch: (http: HttpClient, params: TParams, ctx: FetchContext) => Promise<TResponse>;
	readonly ingest: IngestBinding<TResponse> | null;
}

export interface IngestBinding<TResponse = unknown> {
	readonly useCaseKey: string;
	readonly systemParamKey: string;
	readonly acl: (response: TResponse, ctx: AclContext) => unknown[];
}

export interface AclContext {
	readonly dateBucket: string;
	readonly systemParams: Record<string, unknown>;
	readonly endpointParams: Record<string, unknown>;
}

/**
 * Minimal HTTP client surface that EndpointManifest.fetch uses. Concrete
 * impl is BaseHttpClient (next task), which implements timeout, error
 * wrapping, JSON parsing, and auth-strategy header application.
 */
export interface HttpClient {
	get<T>(path: string, query: Record<string, string>, ctx: FetchContext): Promise<T>;
	post<T>(path: string, query: Record<string, string>, body: unknown, ctx: FetchContext): Promise<T>;
	put<T>(path: string, query: Record<string, string>, body: unknown, ctx: FetchContext): Promise<T>;
	delete<T>(path: string, query: Record<string, string>, ctx: FetchContext): Promise<T>;
}
