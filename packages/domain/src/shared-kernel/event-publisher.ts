import type { DomainEvent } from './domain-event.js';

/**
 * Cross-context port for publishing domain / integration events.
 * Adapters live in infrastructure (in-process EventEmitter, Outbox table, etc.).
 */
export interface EventPublisher {
	publish(events: readonly DomainEvent[]): Promise<void>;
}
