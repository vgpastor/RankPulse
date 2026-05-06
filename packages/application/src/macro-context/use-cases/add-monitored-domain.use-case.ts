import {
	type IdentityAccess,
	MacroContext,
	type ProjectManagement,
	type SharedKernel,
} from '@rankpulse/domain';
import { type Clock, ConflictError, type IdGenerator } from '@rankpulse/shared';

export interface AddMonitoredDomainCommand {
	organizationId: string;
	projectId: string;
	domain: string;
	credentialId?: string | null;
}

export interface AddMonitoredDomainResult {
	monitoredDomainId: string;
}

export class AddMonitoredDomainUseCase {
	constructor(
		private readonly domains: MacroContext.MonitoredDomainRepository,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: AddMonitoredDomainCommand): Promise<AddMonitoredDomainResult> {
		const projectId = cmd.projectId as ProjectManagement.ProjectId;
		// Canonicalise via the VO so the lookup matches the row we'd write.
		const canonical = MacroContext.DomainName.create(cmd.domain);
		const existing = await this.domains.findByProjectAndDomain(projectId, canonical.value);
		if (existing?.isActive()) {
			throw new ConflictError(`Domain ${canonical.value} is already monitored for this project`);
		}

		const id = this.ids.generate() as MacroContext.MonitoredDomainId;
		const md = MacroContext.MonitoredDomain.add({
			id,
			organizationId: cmd.organizationId as IdentityAccess.OrganizationId,
			projectId,
			domain: canonical.value,
			credentialId: cmd.credentialId ?? null,
			now: this.clock.now(),
		});
		await this.domains.save(md);
		await this.events.publish(md.pullEvents());
		return { monitoredDomainId: id };
	}
}
