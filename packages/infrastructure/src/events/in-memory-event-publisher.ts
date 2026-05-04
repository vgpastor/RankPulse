import { EventEmitter } from 'node:events';
import type { SharedKernel } from '@rankpulse/domain';

export type EventListener = (event: SharedKernel.DomainEvent) => void | Promise<void>;

/**
 * Single-process synchronous event bus. Adequate for v1 (single-node deploy).
 * When multi-node scaling is needed (Phase 2), swap for an Outbox-based publisher
 * that writes to a `domain_events` table inside the same transaction as the
 * aggregate state change, and a dispatcher worker that reads and routes them.
 */
export class InMemoryEventPublisher implements SharedKernel.EventPublisher {
	private readonly emitter = new EventEmitter({ captureRejections: true });

	constructor(private readonly logger?: { error: (msg: string, err: unknown) => void }) {
		this.emitter.setMaxListeners(0);
		this.emitter.on('error', (err) => {
			this.logger?.error('event-publisher: listener threw', err);
		});
	}

	async publish(events: readonly SharedKernel.DomainEvent[]): Promise<void> {
		for (const event of events) {
			this.emitter.emit(event.type, event);
			this.emitter.emit('*', event);
		}
	}

	on(eventType: string, listener: EventListener): () => void {
		this.emitter.on(eventType, listener);
		return () => this.emitter.off(eventType, listener);
	}

	onAny(listener: EventListener): () => void {
		return this.on('*', listener);
	}
}
