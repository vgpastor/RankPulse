import type { MacroContext } from '@rankpulse/domain';
import { type Clock, NotFoundError } from '@rankpulse/shared';

export interface RemoveMonitoredDomainCommand {
	monitoredDomainId: string;
}

export class RemoveMonitoredDomainUseCase {
	constructor(
		private readonly domains: MacroContext.MonitoredDomainRepository,
		private readonly clock: Clock,
	) {}

	async execute(cmd: RemoveMonitoredDomainCommand): Promise<void> {
		const md = await this.domains.findById(cmd.monitoredDomainId as MacroContext.MonitoredDomainId);
		if (!md) throw new NotFoundError(`MonitoredDomain ${cmd.monitoredDomainId} not found`);
		if (!md.isActive()) return; // idempotent
		md.remove(this.clock.now());
		await this.domains.save(md);
	}
}
