import { HttpClient, type HttpClientOptions } from './http.js';
import { AuthResource } from './resources/auth.js';
import { ProjectsResource } from './resources/projects.js';

export interface RankPulseClientOptions extends HttpClientOptions {
	apiPrefix?: string;
}

const DEFAULT_PREFIX = '/api/v1';

export class RankPulseClient {
	readonly auth: AuthResource;
	readonly projects: ProjectsResource;

	constructor(options: RankPulseClientOptions) {
		const prefix = options.apiPrefix ?? DEFAULT_PREFIX;
		const baseUrl = `${options.baseUrl.replace(/\/$/, '')}${prefix}`;
		const http = new HttpClient({ ...options, baseUrl });
		this.auth = new AuthResource(http);
		this.projects = new ProjectsResource(http);
	}
}
