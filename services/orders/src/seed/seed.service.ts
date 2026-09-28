import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { ivaRate, priceFromUsd, splitTax } from '@mercadia/contracts';
import { demoId, demoOrders, STORES } from '@mercadia/demo-data';
import { CONFIG, type OrdersConfig } from '../config.js';
import { DB, POOL, type Database } from '../db/database.module.js';
import { orders } from '../db/schema.js';

const DEMO_RATE = 4000;
const SHIPPING_COP = 1_200_000;

/**
 * Loads 80 historical orders (deterministic, shared with payments and fulfillment through
 * packages/demo-data) so dashboards and reviews have data. No events are published: the
 * other services seed their own side of the same history.
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(POOL) private readonly pool: pg.Pool,
    @Inject(CONFIG) private readonly config: OrdersConfig,
  ) {}

  async onApplicationBootstrap() {
    if (this.config.seed) await this.seed();
  }

  async seed() {
    const [{ n }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(orders);
    if (n > 0) return;
    const stores = new Map(STORES.map((s) => [s.id, s.name]));
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const o of demoOrders()) {
        const byStore = new Map<string, typeof o.lines>();
        for (const l of o.lines) byStore.set(l.storeId, [...(byStore.get(l.storeId) ?? []), l]);
        let subtotal = 0;
        let tax = 0;
        const sellerRows = [...byStore].map(([storeId, lines], i) => {
          const priced = lines.map((l) => {
            const unit = priceFromUsd(l.unitPriceUsd, 'COP', DEMO_RATE);
            const total = unit * l.quantity;
            return {
              ...l,
              unit,
              total,
              taxRate: ivaRate(l.category),
              tax: splitTax(total, ivaRate(l.category)).tax,
            };
          });
          const storeSubtotal = priced.reduce((s, l) => s + l.total, 0);
          const storeTax = priced.reduce((s, l) => s + l.tax, 0);
          subtotal += storeSubtotal;
          tax += storeTax;
          return {
            id: demoId('seller-order', `${o.id}-${i}`),
            storeId,
            priced,
            storeSubtotal,
            storeTax,
          };
        });
        const shipping = sellerRows.length * SHIPPING_COP;
        const sellerStatus = o.status;
        const orderStatus = o.status === 'delivered' ? 'completed' : 'paid';
        const address = {
          fullName: o.buyerName,
          phone: '3001234567',
          line1: 'Calle 93 # 13-24',
          city: 'Bogotá',
          department: 'Cundinamarca',
          country: 'CO',
        };
        await client.query(
          `INSERT INTO orders (id, number, buyer_id, buyer_email, buyer_name, currency, fx_rate, subtotal, shipping_total, tax_total, total, status, shipping_address, payment_deadline, paid_at, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,'COP',$6,$7,$8,$9,$10,$11,$12,$13,$13,$13,$13)`,
          [
            o.id,
            o.number,
            o.buyerId,
            o.buyerEmail,
            o.buyerName,
            DEMO_RATE,
            subtotal,
            shipping,
            tax,
            subtotal + shipping,
            orderStatus,
            JSON.stringify(address),
            o.createdAt,
          ],
        );
        for (const s of sellerRows) {
          await client.query(
            `INSERT INTO seller_orders (id, order_id, store_id, store_name, status, subtotal, shipping, tax, total, commission, tracking_number, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [
              s.id,
              o.id,
              s.storeId,
              stores.get(s.storeId) ?? 'Store',
              sellerStatus,
              s.storeSubtotal,
              SHIPPING_COP,
              s.storeTax,
              s.storeSubtotal + SHIPPING_COP,
              Math.round(s.storeSubtotal * this.config.commissionRate),
              sellerStatus === 'paid'
                ? null
                : `MC${o.number}${s.storeId.slice(0, 4).toUpperCase()}`,
              o.createdAt,
            ],
          );
          for (const l of s.priced) {
            await client.query(
              `INSERT INTO order_lines (order_id, seller_order_id, product_id, sku, title, image, options, quantity, unit_price, tax_rate, total)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
              [
                o.id,
                s.id,
                l.productId,
                l.sku,
                l.title,
                l.image,
                JSON.stringify(l.options),
                l.quantity,
                l.unit,
                l.taxRate,
                l.total,
              ],
            );
          }
        }
        await client.query(
          `INSERT INTO status_history (order_id, status, note, at) VALUES ($1,'paid','Payment captured',$2)`,
          [o.id, o.createdAt],
        );
        if (o.status !== 'paid')
          await client.query(
            `INSERT INTO status_history (order_id, status, note, at) VALUES ($1,$2,null,$3)`,
            [o.id, o.status, o.createdAt],
          );
      }
      await client.query("SELECT setval('order_number', 5000)");
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    this.logger.log('demo order history loaded: 80 orders');
  }
}
