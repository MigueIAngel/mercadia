import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from './event-bus.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379/15';

describe.skipIf(process.env.SKIP_REDIS_TESTS === '1')('EventBus (Redis Streams)', () => {
  const admin = new Redis(REDIS_URL);
  let stream: string;
  let buses: EventBus[] = [];

  const bus = (service: string) => {
    const b = new EventBus({ service, redisUrl: REDIS_URL, stream, consume: false, blockMs: 50 });
    buses.push(b);
    return b;
  };

  beforeEach(() => {
    stream = `test:${randomUUID()}`;
  });

  afterEach(async () => {
    await Promise.all(buses.map((b) => b.onModuleDestroy()));
    buses = [];
    await admin.del(stream, `${stream}:dlq`);
  });

  afterAll(() => admin.quit());

  it('delivers each event once to every consumer group', async () => {
    const producer = bus('catalog');
    const orders = bus('orders');
    const ai = bus('ai');
    const seenByOrders: string[] = [];
    const seenByAi: string[] = [];
    orders.on('product.published', async (e) => void seenByOrders.push(e.data.productId));
    ai.on('product.published', async (e) => void seenByAi.push(e.data.productId));
    await orders.ensureGroup();
    await ai.ensureGroup();

    await producer.publish('product.published', {
      productId: 'p1',
      storeId: 's1',
      title: 'Phone',
      category: 'smartphones',
      priceUsd: 10000,
    });
    await orders.poll();
    await ai.poll();
    await orders.poll();

    expect(seenByOrders).toEqual(['p1']);
    expect(seenByAi).toEqual(['p1']);
  });

  it('ignores a redelivered event id', async () => {
    const consumer = bus('orders');
    let calls = 0;
    consumer.on('order.paid', async () => void calls++);
    await consumer.ensureGroup();
    const event = consumer.build('order.paid', { orderId: 'o1', buyerId: 'u1' });

    await consumer.publishEnvelope(event);
    await consumer.publishEnvelope(event);
    await consumer.poll();

    expect(calls).toBe(1);
  });

  it('retries a failing handler and then dead-letters it', async () => {
    const consumer = new EventBus({
      service: 'payments',
      redisUrl: REDIS_URL,
      stream,
      consume: false,
      blockMs: 50,
      maxAttempts: 2,
    });
    buses.push(consumer);
    consumer.on('order.placed', async () => {
      throw new Error('boom');
    });
    await consumer.ensureGroup();
    await consumer.publish('order.placed', {
      orderId: 'o1',
      buyerId: 'u1',
      buyerEmail: 'a@b.co',
      currency: 'USD',
      total: 1,
      lines: [],
    });

    await consumer.poll();
    expect(await admin.xlen(`${stream}:dlq`)).toBe(0);
    await consumer.poll(true);
    expect(await admin.xlen(`${stream}:dlq`)).toBe(1);
  });

  it('dead-letters malformed entries', async () => {
    const consumer = bus('orders');
    consumer.on('order.paid', async () => undefined);
    await consumer.ensureGroup();
    await admin.xadd(stream, '*', 'event', '{not json');
    await consumer.poll();
    expect(await admin.xlen(`${stream}:dlq`)).toBe(1);
  });
});
