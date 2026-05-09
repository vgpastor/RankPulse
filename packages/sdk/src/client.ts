import { HttpClient, type HttpClientOptions } from './http.js';
import { AiSearchResource } from './resources/ai-search.js';
import { AuthResource } from './resources/auth.js';
import { BingResource } from './resources/bing.js';
import { ClarityResource } from './resources/clarity.js';
import { CockpitResource } from './resources/cockpit.js';
import { Ga4Resource } from './resources/ga4.js';
import { GscResource } from './resources/gsc.js';
import { PageSpeedResource } from './resources/page-speed.js';
import { ProjectsResource } from './resources/projects.js';
import { ProvidersResource } from './resources/providers.js';
import { RadarResource } from './resources/radar.js';
import { RankTrackingResource } from './resources/rank-tracking.js';
import { WikipediaResource } from './resources/wikipedia.js';

export interface RankPulseClientOptions extends HttpClientOptions {
	apiPrefix?: string;
}

const DEFAULT_PREFIX = '/api/v1';

export class RankPulseClient {
	readonly aiSearch: AiSearchResource;
	readonly auth: AuthResource;
	readonly projects: ProjectsResource;
	readonly providers: ProvidersResource;
	readonly rankTracking: RankTrackingResource;
	readonly gsc: GscResource;
	readonly wikipedia: WikipediaResource;
	readonly pageSpeed: PageSpeedResource;
	readonly ga4: Ga4Resource;
	readonly bing: BingResource;
	readonly radar: RadarResource;
	readonly clarity: ClarityResource;
	readonly cockpit: CockpitResource;

	constructor(options: RankPulseClientOptions) {
		const prefix = options.apiPrefix ?? DEFAULT_PREFIX;
		const baseUrl = `${options.baseUrl.replace(/\/$/, '')}${prefix}`;
		const http = new HttpClient({ ...options, baseUrl });
		this.aiSearch = new AiSearchResource(http);
		this.auth = new AuthResource(http);
		this.projects = new ProjectsResource(http);
		this.providers = new ProvidersResource(http);
		this.rankTracking = new RankTrackingResource(http);
		this.gsc = new GscResource(http);
		this.wikipedia = new WikipediaResource(http);
		this.pageSpeed = new PageSpeedResource(http);
		this.ga4 = new Ga4Resource(http);
		this.bing = new BingResource(http);
		this.radar = new RadarResource(http);
		this.clarity = new ClarityResource(http);
		this.cockpit = new CockpitResource(http);
	}
}
