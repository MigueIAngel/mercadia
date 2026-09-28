import type { EventBus } from '@mercadia/service-kit';
import { stageEvent } from '@mercadia/service-kit';
import type { EventPayloads, EventType } from '@mercadia/contracts';

interface Queryable {
  query(text: string, values?: unknown[]): Promise<unknown>;
}

/** Builds an event and stages it in the outbox inside the caller's transaction. */
export function stage<T extends EventType>(
  bus: EventBus,
  client: Queryable,
  type: T,
  data: EventPayloads[T],
  orderId: string,
) {
  return stageEvent(client, bus.build(type, data, orderId));
}
