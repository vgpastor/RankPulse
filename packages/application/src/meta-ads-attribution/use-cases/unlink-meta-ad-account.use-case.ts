import type { MetaAdsAttribution } from '@rankpulse/domain';
import { type Clock, NotFoundError } from '@rankpulse/shared';

export interface UnlinkMetaAdAccountCommand {
	metaAdAccountId: string;
}

export class UnlinkMetaAdAccountUseCase {
	constructor(
		private readonly accounts: MetaAdsAttribution.MetaAdAccountRepository,
		private readonly clock: Clock,
	) {}

	async execute(cmd: UnlinkMetaAdAccountCommand): Promise<void> {
		const account = await this.accounts.findById(cmd.metaAdAccountId as MetaAdsAttribution.MetaAdAccountId);
		if (!account) throw new NotFoundError(`MetaAdAccount ${cmd.metaAdAccountId} not found`);
		if (!account.isActive()) return;
		account.unlink(this.clock.now());
		await this.accounts.save(account);
	}
}
