import type {
	AuthStrategy,
	EndpointManifest,
	HttpRequest,
	IngestBinding,
	ProviderManifest,
} from '@rankpulse/provider-core';
import { summariseCdxResponse } from './acl/cdx-to-snapshot.acl.js';
import { type CdxResponse, cdxSnapshotsDescriptor, fetchCdxSnapshots } from './endpoints/cdx-snapshots.js';
import { WaybackHttpClient } from './http.js';

/**
 * Internet Archive Wayback Machine CDX Server manifest.
 *
 * Why `auth.kind = 'custom'` with a no-op sign: same rationale as the
 * Wikipedia provider — the CDX API is unauthenticated, but every manifest
 * must declare an `AuthStrategy`. `'custom'` + pass-through `sign` is the
 * cleanest way to express "no auth at all" without inventing a new variant.
 *
 * The CDX endpoint emits ONE summary row per fetch (snapshot count + latest
 * timestamp + status breakdown) — no time-series fan-out. The IngestBinding
 * routes that single row to the project-management ingest use case via
 * the `competitorId` carried in `systemParams` (set by the auto-schedule
 * handler when an operator wires a competitor for activity tracking).
 */
const waybackSignRequest = (req: HttpRequest, _plaintextSecret: string): HttpRequest => req;

const auth: AuthStrategy = { kind: 'custom', sign: waybackSignRequest };

const cdxAcl = (response: CdxResponse): unknown[] => {
	const summary = summariseCdxResponse(response);
	return [summary];
};

const cdxIngest: IngestBinding<CdxResponse> = {
	useCaseKey: 'project-management:record-competitor-wayback-snapshot',
	systemParamKey: 'competitorId',
	acl: cdxAcl,
};

const endpoints: readonly EndpointManifest[] = [
	{
		descriptor: cdxSnapshotsDescriptor,
		fetch: fetchCdxSnapshots as EndpointManifest<unknown, unknown>['fetch'],
		ingest: cdxIngest as IngestBinding,
	},
];

export const waybackProviderManifest: ProviderManifest = {
	id: 'wayback',
	displayName: 'Internet Archive — Wayback Machine',
	http: {
		baseUrl: 'https://web.archive.org',
		auth,
		defaultTimeoutMs: 60_000,
	},
	validateCredentialPlaintext(_plaintextSecret: string): void {
		// Wayback is unauthenticated. We accept any sentinel string
		// (typically the literal "public") so the registration flow stays
		// uniform with the other providers.
	},
	endpoints,
	buildHttpClient: (http) => new WaybackHttpClient(http),
};
