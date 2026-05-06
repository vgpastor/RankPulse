import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { BrandPrompt } from '../entities/brand-prompt.js';
import type { BrandPromptId } from '../value-objects/identifiers.js';

export interface BrandPromptRepository {
	save(prompt: BrandPrompt): Promise<void>;
	findById(id: BrandPromptId): Promise<BrandPrompt | null>;
	delete(id: BrandPromptId): Promise<void>;
	listForProject(projectId: ProjectId): Promise<readonly BrandPrompt[]>;
	findExisting(projectId: ProjectId, text: string): Promise<BrandPrompt | null>;
}
