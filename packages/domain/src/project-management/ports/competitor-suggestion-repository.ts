import type { CompetitorSuggestion } from '../entities/competitor-suggestion.js';
import type { CompetitorSuggestionId, ProjectId } from '../value-objects/identifiers.js';

export interface CompetitorSuggestionRepository {
	save(suggestion: CompetitorSuggestion): Promise<void>;
	findById(id: CompetitorSuggestionId): Promise<CompetitorSuggestion | null>;
	findByProjectAndDomain(projectId: ProjectId, domain: string): Promise<CompetitorSuggestion | null>;
	listForProject(projectId: ProjectId): Promise<readonly CompetitorSuggestion[]>;
}
