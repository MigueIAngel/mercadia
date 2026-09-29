import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { priceFromUsd } from '@mercadia/contracts';
import { demoId, demoOrders, STORES } from '@mercadia/demo-data';
import { CONFIG, type PaymentsConfig } from '../config.js';
import { DB, POOL, type Database } from '../db/database.module.js';
import { payments } from '../db/schema.js';

const DEMO_RATE = 4000;
const SHIPPING_COP = 1_200_000;
const COMMISSION = 0.08;

/** Payments, escrow transfers and payout accounts matching the demo order history. */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(POOL) private readonly pool: pg.Pool,
    @Inject(CONFIG) private readonly config: PaymentsConfig,
  ) {}

  async onApplicationBootstrap() {
    if (this.config.seed) await this.seed();
  }

  async seed() {
    const [{ n }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(payments);
    if (n > 0) return;
    const names = new Map(STORES.map((s) => [s.id, s.name]));
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const s of STORES) {
        await client.query(
          `INSERT INTO connected_accounts (store_id, provider, provider_account_id, payouts_enabled) VALUES ($1, 'mock', $2, true) ON CONFLICT DO NOTHING`,
          [s.id, `mock_acct_${s.slug}`],
        );
      }
      const brands = ['visa', 'mastercard', 'amex'];
      for (const [index, o] of demoOrders().entries()) {
        const byStore = new Map<string, number>();
        for (const l of o.lines)
          byStore.set(
            l.storeId,
            (byStore.get(l.storeId) ?? 0) +
              priceFromUsd(l.unitPriceUsd, 'COP', DEMO_RATE) * l.quantity,
          );
        const total = [...byStore.values()].reduce((a, b) => a + b + SHIPPING_COP, 0);
        const paymentId = demoId('payment', o.id);
        await client.query(
          `INSERT INTO payments (id, order_id, buyer_id, provider, provider_ref, amount, currency, status, card_brand, card_last4, created_at, updated_at)
           VALUES ($1,$2,$3,'mock',$4,$5,'COP','succeeded',$6,$7,$8,$8)`,
          [
            paymentId,
            o.id,
            o.buyerId,
            `mock_pi_${o.number}`,
            total,
            brands[index % 3],
            ['4242', '4444', '0005'][index % 3],
            o.createdAt,
          ],
        );
        let i = 0;
        for (const [storeId, subtotal] of byStore) {
          const gross = subtotal + SHIPPING_COP;
          const commission = Math.round(subtotal * COMMISSION);
          const released = o.status === 'delivered';
          await client.query(
            `INSERT INTO transfers (payment_id, order_id, seller_order_id, store_id, store_name, gross, commission, amount, currency, status, provider_ref, created_at, released_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'COP',$9,$10,$11,$12)`,
            [
              paymentId,
              o.id,
              demoId('seller-order', `${o.id}-${i}`),
              storeId,
              names.get(storeId),
              gross,
              commission,
              gross - commission,
              released ? 'released' : 'held',
              released ? `mock_tr_${o.number}_${i}` : null,
              o.createdAt,
              released ? o.createdAt : null,
            ],
          );
          i += 1;
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    this.logger.log('demo payments loaded');
  }
}
