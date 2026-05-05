import { InvalidInputError } from '@rankpulse/shared';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { TrackedPageId } from '../value-objects/identifiers.js';

export interface PageSpeedSnapshotProps {
	trackedPageId: TrackedPageId;
	projectId: ProjectId;
	observedAt: Date;
	lcpMs: number | null;
	inpMs: number | null;
	cls: number | null;
	fcpMs: number | null;
	ttfbMs: number | null;
	performanceScore: number | null;
	seoScore: number | null;
	accessibilityScore: number | null;
	bestPracticesScore: number | null;
}

const validateMs = (raw: number | null, label: string): number | null => {
	if (raw === null) return null;
	if (!Number.isFinite(raw) || raw < 0) {
		throw new InvalidInputError(`${label} must be a non-negative finite number or null`);
	}
	return raw;
};

const validateScore = (raw: number | null, label: string): number | null => {
	if (raw === null) return null;
	if (!Number.isFinite(raw) || raw < 0 || raw > 1) {
		throw new InvalidInputError(`${label} must be in [0, 1] or null`);
	}
	return raw;
};

const validateCls = (raw: number | null): number | null => {
	if (raw === null) return null;
	if (!Number.isFinite(raw) || raw < 0) {
		throw new InvalidInputError('cls must be a non-negative finite number or null');
	}
	return raw;
};

/**
 * Immutable value-like row in the time-series store. Encodes its own
 * validation rules so the read model can rely on the invariants
 * (scores in [0, 1], milliseconds non-negative). No domain events;
 * the IngestPageSpeedSnapshotUseCase publishes the event.
 */
export class PageSpeedSnapshot {
	private constructor(private readonly props: PageSpeedSnapshotProps) {}

	static record(input: PageSpeedSnapshotProps): PageSpeedSnapshot {
		return new PageSpeedSnapshot({
			...input,
			lcpMs: validateMs(input.lcpMs, 'lcpMs'),
			inpMs: validateMs(input.inpMs, 'inpMs'),
			cls: validateCls(input.cls),
			fcpMs: validateMs(input.fcpMs, 'fcpMs'),
			ttfbMs: validateMs(input.ttfbMs, 'ttfbMs'),
			performanceScore: validateScore(input.performanceScore, 'performanceScore'),
			seoScore: validateScore(input.seoScore, 'seoScore'),
			accessibilityScore: validateScore(input.accessibilityScore, 'accessibilityScore'),
			bestPracticesScore: validateScore(input.bestPracticesScore, 'bestPracticesScore'),
		});
	}

	static rehydrate(props: PageSpeedSnapshotProps): PageSpeedSnapshot {
		return new PageSpeedSnapshot(props);
	}

	get trackedPageId(): TrackedPageId {
		return this.props.trackedPageId;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get observedAt(): Date {
		return this.props.observedAt;
	}
	get lcpMs(): number | null {
		return this.props.lcpMs;
	}
	get inpMs(): number | null {
		return this.props.inpMs;
	}
	get cls(): number | null {
		return this.props.cls;
	}
	get fcpMs(): number | null {
		return this.props.fcpMs;
	}
	get ttfbMs(): number | null {
		return this.props.ttfbMs;
	}
	get performanceScore(): number | null {
		return this.props.performanceScore;
	}
	get seoScore(): number | null {
		return this.props.seoScore;
	}
	get accessibilityScore(): number | null {
		return this.props.accessibilityScore;
	}
	get bestPracticesScore(): number | null {
		return this.props.bestPracticesScore;
	}
}
