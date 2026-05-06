import type { MacroContextContracts } from '@rankpulse/contracts';
import type { HttpClient } from '../http.js';

export class RadarResource {
	constructor(private readonly http: HttpClient) {}

	listForProject(projectId: string): Promise<MacroContextContracts.MonitoredDomainDto[]> {
		return this.http.get(`/projects/${encodeURIComponent(projectId)}/radar/domains`);
	}

	add(
		projectId: string,
		body: MacroContextContracts.AddMonitoredDomainRequest,
	): Promise<{ monitoredDomainId: string }> {
		return this.http.post(`/projects/${encodeURIComponent(projectId)}/radar/domains`, body);
	}

	remove(monitoredDomainId: string): Promise<{ ok: true }> {
		return this.http.delete(`/radar/domains/${encodeURIComponent(monitoredDomainId)}`);
	}

	history(
		monitoredDomainId: string,
		query: MacroContextContracts.RadarHistoryQuery,
	): Promise<MacroContextContracts.RadarHistoryRowDto[]> {
		return this.http.get(`/radar/domains/${encodeURIComponent(monitoredDomainId)}/history`, {
			query: { from: query.from, to: query.to },
		});
	}
}
