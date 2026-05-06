import { ConflictError, InvalidInputError } from '@rankpulse/shared';
import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import { BrandPromptCreated } from '../events/brand-prompt-created.js';
import { BrandPromptPaused } from '../events/brand-prompt-paused.js';
import { BrandPromptResumed } from '../events/brand-prompt-resumed.js';
import type { BrandPromptId } from '../value-objects/identifiers.js';
import type { PromptKind } from '../value-objects/prompt-kind.js';
import type { PromptText } from '../value-objects/prompt-text.js';

export interface BrandPromptProps {
	id: BrandPromptId;
	organizationId: OrganizationId;
	projectId: ProjectId;
	text: PromptText;
	kind: PromptKind;
	pausedAt: Date | null;
	createdAt: Date;
}

/**
 * The user-facing decision to monitor a specific prompt against the project's
 * connected LLM providers. One BrandPrompt fans out to N JobDefinitions
 * (`prompt × LocationLanguage × AiProvider`) via the AutoSchedule handler.
 */
export class BrandPrompt extends AggregateRoot {
	private constructor(private props: BrandPromptProps) {
		super();
	}

	static register(input: {
		id: BrandPromptId;
		organizationId: OrganizationId;
		projectId: ProjectId;
		text: PromptText;
		kind: PromptKind;
		now: Date;
	}): BrandPrompt {
		const prompt = new BrandPrompt({
			id: input.id,
			organizationId: input.organizationId,
			projectId: input.projectId,
			text: input.text,
			kind: input.kind,
			pausedAt: null,
			createdAt: input.now,
		});
		prompt.record(
			new BrandPromptCreated({
				brandPromptId: input.id,
				organizationId: input.organizationId,
				projectId: input.projectId,
				text: input.text.value,
				kind: input.kind,
				occurredAt: input.now,
			}),
		);
		return prompt;
	}

	static rehydrate(props: BrandPromptProps): BrandPrompt {
		return new BrandPrompt(props);
	}

	pause(now: Date): void {
		if (this.props.pausedAt) {
			throw new ConflictError('BrandPrompt is already paused');
		}
		this.props = { ...this.props, pausedAt: now };
		this.record(
			new BrandPromptPaused({
				brandPromptId: this.props.id,
				projectId: this.props.projectId,
				occurredAt: now,
			}),
		);
	}

	resume(now: Date): void {
		if (!this.props.pausedAt) {
			throw new InvalidInputError('BrandPrompt is not paused');
		}
		this.props = { ...this.props, pausedAt: null };
		this.record(
			new BrandPromptResumed({
				brandPromptId: this.props.id,
				projectId: this.props.projectId,
				occurredAt: now,
			}),
		);
	}

	isActive(): boolean {
		return this.props.pausedAt === null;
	}

	get id(): BrandPromptId {
		return this.props.id;
	}
	get organizationId(): OrganizationId {
		return this.props.organizationId;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get text(): PromptText {
		return this.props.text;
	}
	get kind(): PromptKind {
		return this.props.kind;
	}
	get pausedAt(): Date | null {
		return this.props.pausedAt;
	}
	get createdAt(): Date {
		return this.props.createdAt;
	}
}
