import { ProviderConnectivity } from '@rankpulse/domain';
import type { EndpointDescriptor, FetchContext, Provider } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import { JWT } from 'google-auth-library';
import {
	fetchRunPagespeed,
	type RunPagespeedParams,
	runPagespeedDescriptor,
} from './endpoints/runpagespeed.js';
import { type PageSpeedAuth, PageSpeedHttp, type PageSpeedHttpOptions } from './http.js';

const ENDPOINTS: readonly EndpointDescriptor[] = [runPagespeedDescriptor];

const API_KEY_REGEX = /^[A-Za-z0-9_-]{20,}$/;

/** OAuth2 scope PSI accepts. The same `cloud-platform` scope works for
 * any Google API the SA has been authorized on; we keep it tight to PSI
 * intent so the SA's other privileges don't bleed in. */
const PSI_OAUTH_SCOPES = ['https://www.googleapis.com/auth/cloud-platform.read-only'];

/**
 * Google PageSpeed Insights provider — v1.1 free expansion (issue #18).
 *
 * Polymorphic auth — the credential's `plaintextSecret` is auto-detected
 * at fetch time and the right transport is used:
 *
 *  - **Service Account JSON**: parsed; an OAuth2 access token is minted
 *    via `google-auth-library` and passed as `Authorization: Bearer <tok>`.
 *    Same SA can be reused for GSC / GA4 (a single secret in the vault
 *    covers all three Google APIs RankPulse consumes).
 *  - **API key string**: passed as `?key=<key>` query param. Useful for
 *    portfolios/projects that don't have a Google Cloud project (or
 *    don't want to grant the SA viewership of their resources).
 *
 * The credential cascade (org → portfolio → project → domain — see
 * `ResolveProviderCredentialUseCase`) is unchanged; an operator can have
 * a default SA at the org scope and override per-project to use an API
 * key (or vice-versa) by registering a domain/project-scoped credential.
 *
 * Validation at registration time accepts both formats so a typo on either
 * still fails fast instead of becoming a runtime 403 in the worker.
 */
export class PageSpeedProvider implements Provider {
	readonly id = ProviderConnectivity.ProviderId.create('pagespeed');
	readonly displayName = 'Google PageSpeed Insights';
	// Kept singular for back-compat with the public `Provider` contract.
	// Both `apiKey` and `serviceAccount` are accepted at runtime; the
	// validateCredentialPlaintext + fetch paths do the actual dispatch.
	// When `Provider.authStrategies: AuthStrategy[]` lands (BACKLOG
	// followup), this becomes `['serviceAccount', 'apiKey']`.
	readonly authStrategy = 'apiKey' as const;

	private readonly http: PageSpeedHttp;

	constructor(options?: PageSpeedHttpOptions) {
		this.http = new PageSpeedHttp(options);
	}

	discover(): readonly EndpointDescriptor[] {
		return ENDPOINTS;
	}

	validateCredentialPlaintext(plaintextSecret: string): void {
		// Try both shapes; reject only if neither matches.
		const trimmed = plaintextSecret.trim();
		if (trimmed.startsWith('{')) {
			// Looks like JSON — must be a valid Service Account.
			try {
				const parsed = JSON.parse(trimmed) as { client_email?: unknown; private_key?: unknown };
				if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') {
					throw new Error();
				}
			} catch {
				throw new InvalidInputError(
					'PageSpeed credential JSON must be a Google Service Account with client_email + private_key',
				);
			}
			return;
		}
		// Else expect a bare API key.
		if (!API_KEY_REGEX.test(trimmed)) {
			throw new InvalidInputError(
				'PageSpeed credential must be either a Service Account JSON or an API key (>=20 chars of [A-Za-z0-9_-])',
			);
		}
	}

	async fetch(endpointId: string, params: unknown, ctx: FetchContext): Promise<unknown> {
		switch (endpointId) {
			case runPagespeedDescriptor.id: {
				const auth = await this.resolveAuth(ctx.credential.plaintextSecret);
				return await fetchRunPagespeed(
					this.http,
					this.parseParams(runPagespeedDescriptor, params) as RunPagespeedParams,
					auth,
					ctx,
				);
			}
			default:
				throw new InvalidInputError(`PageSpeed has no endpoint "${endpointId}"`);
		}
	}

	/**
	 * Decide auth path from the credential shape:
	 * - JSON object that parses as a SA → mint a Bearer token (cached
	 *   internally by google-auth-library until expiry).
	 * - Otherwise → treat as a bare API key.
	 */
	private async resolveAuth(plaintextSecret: string): Promise<PageSpeedAuth> {
		const trimmed = plaintextSecret.trim();
		if (trimmed.startsWith('{')) {
			let key: { client_email?: string; private_key?: string };
			try {
				key = JSON.parse(trimmed);
			} catch {
				throw new InvalidInputError('PSI credential parses as JSON but is not valid');
			}
			if (!key.client_email || !key.private_key) {
				throw new InvalidInputError('PSI service account JSON must contain client_email and private_key');
			}
			const jwt = new JWT({
				email: key.client_email,
				key: key.private_key,
				scopes: PSI_OAUTH_SCOPES,
			});
			const { token } = await jwt.getAccessToken();
			if (!token) {
				throw new InvalidInputError('Failed to mint OAuth2 access token from PSI service account');
			}
			return { kind: 'bearer', token };
		}
		return { kind: 'apiKey', apiKey: trimmed };
	}

	private parseParams(descriptor: EndpointDescriptor, raw: unknown): unknown {
		const parsed = descriptor.paramsSchema.safeParse(raw);
		if (!parsed.success) {
			throw new InvalidInputError(`Invalid params for ${descriptor.id}: ${parsed.error.message}`);
		}
		return parsed.data;
	}
}
