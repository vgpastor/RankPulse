import type { SharedKernel } from '@rankpulse/domain';

export class RecordingEventPublisher implements SharedKernel.EventPublisher {
	private readonly buffer: SharedKernel.DomainEvent[] = [];

	async publish(events: readonly SharedKernel.DomainEvent[]): Promise<void> {
		this.buffer.push(...events);
	}

	published(): readonly SharedKernel.DomainEvent[] {
		return this.buffer;
	}

	publishedTypes(): readonly string[] {
		return this.buffer.map((e) => e.type);
	}

	clear(): void {
		this.buffer.length = 0;
	}
}
