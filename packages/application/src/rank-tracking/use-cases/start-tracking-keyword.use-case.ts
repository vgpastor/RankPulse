import { type IdentityAccess, ProjectManagement, RankTracking, type SharedKernel } from '@rankpulse/domain';
import { type Clock, ConflictError, type IdGenerator } from '@rankpulse/shared';

export interface StartTrackingKeywordCommand {
	organizationId: string;
	projectId: string;
	domain: string;
	phrase: string;
	country: string;
	language: string;
	device?: RankTracking.Device;
}

export interface StartTrackingKeywordResult {
	trackedKeywordId: string;
}

export class StartTrackingKeywordUseCase {
	constructor(
		private readonly trackedKeywords: RankTracking.TrackedKeywordRepository,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: StartTrackingKeywordCommand): Promise<StartTrackingKeywordResult> {
		const projectId = cmd.projectId as ProjectManagement.ProjectId;
		const domain = ProjectManagement.DomainName.create(cmd.domain);
		const phrase = ProjectManagement.KeywordPhrase.create(cmd.phrase);
		const location = ProjectManagement.LocationLanguage.create({
			country: cmd.country,
			language: cmd.language,
		});
		const device = cmd.device ?? RankTracking.Devices.DESKTOP;

		const existing = await this.trackedKeywords.findExisting({
			projectId,
			domain: domain.value,
			phrase: phrase.value,
			country: location.country,
			language: location.language,
			device,
			searchEngine: RankTracking.SearchEngines.GOOGLE,
		});
		if (existing) {
			throw new ConflictError(
				`Keyword "${phrase.value}" is already tracked for ${domain.value} in this location/device`,
			);
		}

		const id = this.ids.generate() as RankTracking.TrackedKeywordId;
		const tracked = RankTracking.TrackedKeyword.start({
			id,
			organizationId: cmd.organizationId as IdentityAccess.OrganizationId,
			projectId,
			domain,
			phrase,
			location,
			device,
			now: this.clock.now(),
		});

		await this.trackedKeywords.save(tracked);
		await this.events.publish(tracked.pullEvents());

		return { trackedKeywordId: id };
	}
}
