import { HttpClient, type HttpClientOptions } from './http.js';
import { AuthResource } from './resources/auth.js';
import { GscResource } from './resources/gsc.js';
import { ProjectsResource } from './resources/projects.js';
import { ProvidersResource } from './resources/providers.js';
import { RankTrackingResource } from './resources/rank-tracking.js';
import { WikipediaResource } from './resources/wikipedia.js';

export interface RankPulseClientOptions extends HttpClientOptions {
	apiPrefix?: string;
}

const DEFAULT_PREFIX = '/api/v1';

export class RankPulseClient {
	readonly auth: AuthResource;
	readonly projects: ProjectsResource;
	readonly providers: ProvidersResource;
	readonly rankTracking: RankTrackingResource;
	readonly gsc: GscResource;
	readonly wikipedia: WikipediaResource;

	constructor(options: RankPulseClientOptions) {
		const prefix = options.apiPrefix ?? DEFAULT_PREFIX;
		const baseUrl = `${options.baseUrl.replace(/\/$/, '')}${prefix}`;
		const http = new HttpClient({ ...options, baseUrl });
		this.auth = new AuthResource(http);
		this.projects = new ProjectsResource(http);
		this.providers = new ProvidersResource(http);
		this.rankTracking = new RankTrackingResource(http);
		this.gsc = new GscResource(http);
		this.wikipedia = new WikipediaResource(http);
	}
}
