import type { Competitor } from '../entities/competitor.js';
import type { DomainName } from '../value-objects/domain-name.js';
import type { CompetitorId, ProjectId } from '../value-objects/identifiers.js';

export interface CompetitorRepository {
	save(competitor: Competitor): Promise<void>;
	findById(id: CompetitorId): Promise<Competitor | null>;
	findByDomain(projectId: ProjectId, domain: DomainName): Promise<Competitor | null>;
	listForProject(projectId: ProjectId): Promise<readonly Competitor[]>;
}
