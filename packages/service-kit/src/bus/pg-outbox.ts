import { Logger } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { EventEnvelope } from '@mercadia/contracts';
import type { EventBus } from './event-bus.js';

/** DDL each PostgreSQL service includes in its migrations. */
export const OUTBOX_DDL = `
CREATE TABLE IF NOT EXISTS outbox (
  id bigserial PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX IF NOT EXISTS outbox_unpublished ON outbox (id) WHERE published_at IS NULL;
`;

interface Queryable {
  query(text: string, values?: unknown[]): Promise<unknown>;
}

/** Stage an event inside the caller's transaction; it is published only after commit. */
export async function stageEvent(client: Queryable, event: EventEnvelope) {
  await client.query('INSERT INTO outbox (event_id, payload) VALUES ($1, $2)', [
    event.id,
    JSON.stringify(event),
  ]);
}

/** Relays committed outbox rows to the event bus in insertion order. */
export class OutboxRelay {
  private readonly logger = new Logger(OutboxRelay.name);
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(
    private readonly pool: Pool,
    private readonly bus: EventBus,
    private readonly intervalMs = 500,
  ) {}

  async publishPending(batch = 100): Promise<number> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{ id: string; payload: EventEnvelope }>(
        `SELECT id, payload FROM outbox WHERE published_at IS NULL
         ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`,
        [batch],
      );
      for (const row of rows) {
        await this.bus.publishEnvelope(row.payload);
        await client.query('UPDATE outbox SET published_at = now() WHERE id = $1', [row.id]);
      }
      await client.query('COMMIT');
      return rows.length;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  start() {
    this.timer = setInterval(async () => {
      if (this.busy) return;
      this.busy = true;
      try {
        await this.publishPending();
      } catch (error) {
        this.logger.error(`outbox relay failed: ${String(error)}`);
      } finally {
        this.busy = false;
      }
    }, this.intervalMs);
  }

  stop() {
    clearInterval(this.timer);
  }
}
