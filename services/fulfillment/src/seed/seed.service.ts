import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { demoId, demoOrders, STORES } from '@mercadia/demo-data';
import { CONFIG, type FulfillmentConfig } from '../config.js';
import { DB, POOL, type Database } from '../db/database.module.js';
import { sellerOrders } from '../db/schema.js';

const HOUR = 3_600_000;

/** Seller-order projections, shipments with tracking history and two open cases. */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(POOL) private readonly pool: pg.Pool,
    @Inject(CONFIG) private readonly config: FulfillmentConfig,
  ) {}

  async onApplicationBootstrap() {
    if (this.config.seed) await this.seed();
  }

  async seed() {
    const [{ n }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(sellerOrders);
    if (n > 0) return;
    const city = new Map(STORES.map((s) => [s.id, s.city]));
    const destination = {
      fullName: '',
      phone: '3001234567',
      line1: 'Calle 93 # 13-24',
      city: 'Bogotá',
      department: 'Cundinamarca',
      country: 'CO',
    };
    const client = await this.pool.connect();
    const disputable: {
      sellerOrderId: string;
      orderId: string;
      storeId: string;
      buyerId: string;
    }[] = [];
    try {
      await client.query('BEGIN');
      for (const o of demoOrders()) {
        const stores = [...new Set(o.lines.map((l) => l.storeId))];
        for (const [i, storeId] of stores.entries()) {
          const sellerOrderId = demoId('seller-order', `${o.id}-${i}`);
          await client.query(
            `INSERT INTO seller_orders (id, order_id, store_id, buyer_id, status, updated_at) VALUES ($1,$2,$3,$4,$5,$6)`,
            [sellerOrderId, o.id, storeId, o.buyerId, o.status, o.createdAt],
          );
          if (o.status === 'paid') continue;
          const created = new Date(o.createdAt).getTime();
          const steps =
            o.status === 'delivered'
              ? ['label_created', 'in_transit', 'out_for_delivery', 'delivered']
              : ['label_created', 'in_transit'];
          const { rows } = await client.query<{ id: string }>(
            `INSERT INTO shipments (seller_order_id, order_id, store_id, buyer_id, carrier, tracking_number, status, origin, destination, estimated_delivery, delivered_at, created_at)
             VALUES ($1,$2,$3,$4,'Mercadia Envíos',$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
            [
              sellerOrderId,
              o.id,
              storeId,
              o.buyerId,
              `MC${o.number}${i}${storeId.slice(0, 3).toUpperCase()}`,
              steps.at(-1),
              city.get(storeId) ?? 'Bogotá',
              JSON.stringify({ ...destination, fullName: o.buyerName }),
              new Date(created + 96 * HOUR),
              o.status === 'delivered' ? new Date(created + 72 * HOUR) : null,
              new Date(created + 2 * HOUR),
            ],
          );
          for (const [k, status] of steps.entries()) {
            await client.query(
              `INSERT INTO tracking_events (shipment_id, status, location, at) VALUES ($1,$2,$3,$4)`,
              [
                rows[0].id,
                status,
                k === 0
                  ? (city.get(storeId) ?? 'Bogotá')
                  : k === 1
                    ? 'Centro de distribución Bogotá'
                    : 'Bogotá',
                new Date(created + (2 + k * 20) * HOUR),
              ],
            );
          }
          if (o.status === 'delivered')
            disputable.push({ sellerOrderId, orderId: o.id, storeId, buyerId: o.buyerId });
        }
      }
      // Two recent cases so the dispute center is not empty.
      const cases = [
        {
          ...disputable.at(-1)!,
          reason: 'damaged',
          status: 'open',
          text: 'El producto llegó con la caja rota y un golpe en la esquina.',
        },
        {
          ...disputable.at(-2)!,
          reason: 'not_as_described',
          status: 'escalated',
          text: 'The colour is different from the photos.',
        },
      ];
      for (const c of cases) {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO disputes (order_id, seller_order_id, store_id, buyer_id, reason, description, requested_amount, max_amount, currency, status, seller_deadline)
           VALUES ($1,$2,$3,$4,$5,$6,5000000,20000000,'COP',$7, now() + interval '48 hours') RETURNING id`,
          [c.orderId, c.sellerOrderId, c.storeId, c.buyerId, c.reason, c.text, c.status],
        );
        await client.query(
          `INSERT INTO dispute_messages (dispute_id, author_id, author_role, text) VALUES ($1,$2,'buyer',$3)`,
          [rows[0].id, c.buyerId, c.text],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    this.logger.log('demo shipments and disputes loaded');
  }
}
