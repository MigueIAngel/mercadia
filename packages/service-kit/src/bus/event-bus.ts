import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { Redis } from 'ioredis';
import {
  EVENTS_STREAM,
  type EventEnvelope,
  type EventPayloads,
  type EventType,
} from '@mercadia/contracts';

export const EVENT_BUS_OPTIONS = Symbol('EVENT_BUS_OPTIONS');

export interface EventBusOptions {
  /** Service name: used as `source` and as the consumer group. */
  service: string;
  redisUrl: string;
  stream?: string;
  /** Start the consumer loop (off in unit tests). */
  consume?: boolean;
  /** Long blocking reads keep the command count low on hosted Redis. */
  blockMs?: number;
  maxAttempts?: number;
}

type Handler<T extends EventType> = (event: EventEnvelope<T>) => Promise<void>;

type XReadGroupReply = [string, [string, string[]][]][] | null;

const PROCESSED_TTL_SECONDS = 7 * 24 * 3600;

/**
 * Redis Streams event bus. Every service reads the shared stream through its own consumer
 * group, so each event reaches every interested service once and survives restarts.
 * Delivery is at least once: handlers run once per event id (tracked in Redis) and
 * failures are retried, then moved to `<stream>:dlq`.
 */
@Injectable()
export class EventBus implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(EventBus.name);
  private readonly handlers = new Map<string, Handler<any>[]>();
  private readonly attempts = new Map<string, number>();
  private readonly stream: string;
  private readonly consumer = `${hostname()}-${process.pid}`;
  private writer?: Redis;
  private reader?: Redis;
  private running = false;
  private loop?: Promise<void>;

  constructor(@Inject(EVENT_BUS_OPTIONS) private readonly options: EventBusOptions) {
    this.stream = options.stream ?? EVENTS_STREAM;
  }

  private get redis(): Redis {
    // RESP2 keeps XREADGROUP replies as nested arrays.
    this.writer ??= new Redis(this.options.redisUrl, { protocol: 2, maxRetriesPerRequest: 3 });
    return this.writer;
  }

  on<T extends EventType>(type: T, handler: Handler<T>) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }

  build<T extends EventType>(
    type: T,
    data: EventPayloads[T],
    correlationId?: string,
  ): EventEnvelope<T> {
    return {
      id: randomUUID(),
      type,
      source: this.options.service,
      occurredAt: new Date().toISOString(),
      correlationId: correlationId ?? randomUUID(),
      data,
    };
  }

  async publish<T extends EventType>(type: T, data: EventPayloads[T], correlationId?: string) {
    return this.publishEnvelope(this.build(type, data, correlationId));
  }

  /** Used by the transactional outbox relay, which stores fully built envelopes. */
  async publishEnvelope(event: EventEnvelope) {
    await this.redis.call(
      'XADD',
      this.stream,
      'MAXLEN',
      '~',
      '50000',
      '*',
      'event',
      JSON.stringify(event),
    );
    return event;
  }

  /** Handles one raw entry. Exposed for tests. */
  async dispatch(entryId: string, raw: string | undefined): Promise<void> {
    const group = this.options.service;
    let event: EventEnvelope;
    try {
      event = JSON.parse(raw ?? '') as EventEnvelope;
      if (!event.id || !event.type) throw new Error('incomplete envelope');
    } catch {
      await this.deadLetter(entryId, raw, 'malformed');
      return;
    }
    const handlers = this.handlers.get(event.type) ?? [];
    const key = `processed:${group}:${event.id}`;
    if (handlers.length === 0 || (await this.redis.exists(key))) {
      await this.ack(entryId);
      return;
    }
    try {
      for (const handler of handlers) await handler(event);
      await this.redis.set(key, '1', 'EX', PROCESSED_TTL_SECONDS);
      await this.ack(entryId);
      this.logger.log(`handled ${event.type} (${event.correlationId})`);
    } catch (error) {
      const attempt = (this.attempts.get(entryId) ?? 0) + 1;
      this.attempts.set(entryId, attempt);
      this.logger.error(`${event.type} failed (attempt ${attempt}): ${String(error)}`);
      if (attempt >= (this.options.maxAttempts ?? 5)) {
        await this.deadLetter(entryId, raw, String(error));
      }
    }
  }

  async poll(pending = false): Promise<number> {
    this.reader ??= new Redis(this.options.redisUrl, { protocol: 2, maxRetriesPerRequest: null });
    const args: (string | number)[] = ['GROUP', this.options.service, this.consumer, 'COUNT', 50];
    if (!pending) args.push('BLOCK', this.options.blockMs ?? 20_000);
    args.push('STREAMS', this.stream, pending ? '0' : '>');
    const reply = (await this.reader.call('XREADGROUP', ...args)) as XReadGroupReply;
    let count = 0;
    for (const [, entries] of reply ?? []) {
      for (const [id, fields] of entries) {
        const flat = fields ?? [];
        await this.dispatch(id, flat[flat.indexOf('event') + 1]);
        count += 1;
      }
    }
    return count;
  }

  async ensureGroup() {
    try {
      await this.redis.call('XGROUP', 'CREATE', this.stream, this.options.service, '0', 'MKSTREAM');
    } catch (error) {
      if (!String(error).includes('BUSYGROUP')) throw error;
    }
  }

  onApplicationBootstrap() {
    if (this.options.consume === false || this.handlers.size === 0) return;
    this.running = true;
    this.loop = this.run();
  }

  async onModuleDestroy() {
    this.running = false;
    this.reader?.disconnect();
    await this.loop?.catch(() => undefined);
    await this.writer?.quit().catch(() => undefined);
  }

  private async run() {
    let recovered = false;
    while (this.running) {
      try {
        await this.ensureGroup();
        if (!recovered || this.attempts.size > 0) {
          await this.poll(true);
          recovered = true;
        }
        await this.poll(false);
      } catch (error) {
        if (!this.running) return;
        this.logger.error(`consumer loop error: ${String(error)}`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }

  private async ack(entryId: string) {
    this.attempts.delete(entryId);
    await this.redis.call('XACK', this.stream, this.options.service, entryId);
  }

  private async deadLetter(entryId: string, raw: string | undefined, reason: string) {
    await this.redis.call(
      'XADD',
      `${this.stream}:dlq`,
      '*',
      'event',
      raw ?? '',
      'reason',
      reason,
      'group',
      this.options.service,
    );
    await this.ack(entryId);
  }
}
