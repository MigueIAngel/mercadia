import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { and, asc, desc, eq, isNotNull, lte } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import type pg from 'pg';
import { STORES } from '@mercadia/demo-data';
import { EventBus, stageEvent, type AuthUser } from '@mercadia/service-kit';
import { OrdersClient } from '../clients/orders.client.js';
import { CONFIG, type FulfillmentConfig } from '../config.js';
import { DB, POOL, type Database } from '../db/database.module.js';
import {
  sellerOrders,
  shipments,
  trackingEvents,
  type Shipment,
  type ShipmentStatus,
} from '../db/schema.js';
import { quoteParcel, zoneFor } from '../rates/rates.js';

const NEXT: Partial<Record<ShipmentStatus, ShipmentStatus>> = {
  label_created: 'in_transit',
  in_transit: 'out_for_delivery',
  out_for_delivery: 'delivered',
};

@Injectable()
export class ShipmentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ShipmentsService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(POOL) private readonly pool: pg.Pool,
    @Inject(CONFIG) private readonly config: FulfillmentConfig,
    private readonly orders: OrdersClient,
    private readonly bus: EventBus,
  ) {}

  onModuleInit() {
    this.timer = setInterval(
      () => void this.advanceDue().catch((e) => this.logger.error(String(e))),
      10_000,
    );
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** The seller prints a label: the shipment starts and the simulated carrier takes over. */
  async create(
    user: AuthUser,
    sellerOrderId: string,
    service: 'standard' | 'express' = 'standard',
  ) {
    const [so] = await this.db
      .select()
      .from(sellerOrders)
      .where(eq(sellerOrders.id, sellerOrderId));
    if (!so || so.storeId !== user.storeId) throw new NotFoundException('Order not found');
    if (!['paid', 'processing'].includes(so.status))
      throw new BadRequestException(`Order is ${so.status}`);
    const [existing] = await this.db
      .select()
      .from(shipments)
      .where(eq(shipments.sellerOrderId, sellerOrderId));
    if (existing) throw new ConflictException('This order already has a shipment');

    const order = await this.orders.get(so.orderId);
    const origin = STORES.find((s) => s.id === so.storeId)?.city ?? 'Bogotá';
    const quote = quoteParcel(zoneFor({ city: origin }, order.shippingAddress), 500, 0);
    const days = service === 'express' ? Math.max(1, Math.ceil(quote.etaDays / 2)) : quote.etaDays;
    const tracking = `MC${Date.now().toString().slice(-6)}${randomInt(1000, 9999)}`;

    const client = await this.pool.connect();
    let shipment: Shipment;
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO shipments (seller_order_id, order_id, store_id, buyer_id, carrier, service, tracking_number, origin, destination, estimated_delivery, next_step_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now() + ($10 || ' days')::interval, now() + ($11 || ' seconds')::interval) RETURNING id`,
        [
          sellerOrderId,
          so.orderId,
          so.storeId,
          so.buyerId,
          quote.carrier,
          service,
          tracking,
          origin,
          JSON.stringify(order.shippingAddress),
          String(days),
          String(this.config.trackingStepSeconds),
        ],
      );
      await client.query(
        `INSERT INTO tracking_events (shipment_id, status, location) VALUES ($1, 'label_created', $2)`,
        [rows[0].id, origin],
      );
      await stageEvent(
        client,
        this.bus.build(
          'shipment.status_changed',
          {
            orderId: so.orderId,
            sellerOrderId,
            buyerId: so.buyerId,
            trackingNumber: tracking,
            status: 'label_created',
          },
          so.orderId,
        ),
      );
      await client.query('COMMIT');
      [shipment] = await this.db.select().from(shipments).where(eq(shipments.id, rows[0].id));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return shipment;
  }

  /** Moves one shipment to its next carrier status (the simulator calls this). */
  async advance(shipmentId: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<
        Shipment & {
          seller_order_id: string;
          order_id: string;
          buyer_id: string;
          tracking_number: string;
        }
      >('SELECT * FROM shipments WHERE id = $1 FOR UPDATE', [shipmentId]);
      const s = rows[0];
      const next = s && NEXT[s.status];
      if (!next) {
        await client.query('ROLLBACK');
        return null;
      }
      const destination = s.destination as { city: string };
      const location =
        next === 'in_transit' ? `Centro de distribución ${destination.city}` : destination.city;
      await client.query(
        `UPDATE shipments SET status = $2::varchar,
           next_step_at = CASE WHEN $2::varchar = 'delivered' THEN NULL ELSE now() + ($3 || ' seconds')::interval END,
           delivered_at = CASE WHEN $2::varchar = 'delivered' THEN now() ELSE delivered_at END
         WHERE id = $1`,
        [shipmentId, next, String(this.config.trackingStepSeconds)],
      );
      await client.query(
        'INSERT INTO tracking_events (shipment_id, status, location) VALUES ($1, $2, $3)',
        [shipmentId, next, location],
      );
      await stageEvent(
        client,
        this.bus.build(
          'shipment.status_changed',
          {
            orderId: s.order_id,
            sellerOrderId: s.seller_order_id,
            buyerId: s.buyer_id,
            trackingNumber: s.tracking_number,
            status: next,
          },
          s.order_id,
        ),
      );
      await client.query('COMMIT');
      return next;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async advanceDue() {
    const due = await this.db
      .select({ id: shipments.id })
      .from(shipments)
      .where(and(isNotNull(shipments.nextStepAt), lte(shipments.nextStepAt, new Date())))
      .limit(50);
    for (const s of due) await this.advance(s.id);
    return due.length;
  }

  async track(trackingNumber: string) {
    const [shipment] = await this.db
      .select()
      .from(shipments)
      .where(eq(shipments.trackingNumber, trackingNumber.toUpperCase()));
    if (!shipment) throw new NotFoundException('Unknown tracking number');
    const events = await this.db
      .select()
      .from(trackingEvents)
      .where(eq(trackingEvents.shipmentId, shipment.id))
      .orderBy(asc(trackingEvents.id));
    // Public page: the destination is reduced to the city.
    return {
      trackingNumber: shipment.trackingNumber,
      carrier: shipment.carrier,
      service: shipment.service,
      status: shipment.status,
      origin: shipment.origin,
      destinationCity: shipment.destination.city,
      estimatedDelivery: shipment.estimatedDelivery,
      deliveredAt: shipment.deliveredAt,
      events: events.map((e) => ({ status: e.status, location: e.location, at: e.at })),
    };
  }

  async forOrder(orderId: string, user: AuthUser) {
    const list = await this.db.select().from(shipments).where(eq(shipments.orderId, orderId));
    const visible = list.filter(
      (s) => s.buyerId === user.sub || s.storeId === user.storeId || user.roles.includes('admin'),
    );
    return Promise.all(
      visible.map((s) =>
        this.track(s.trackingNumber).then((t) => ({ ...t, sellerOrderId: s.sellerOrderId })),
      ),
    );
  }

  sellerList(storeId: string) {
    return this.db
      .select()
      .from(shipments)
      .where(eq(shipments.storeId, storeId))
      .orderBy(desc(shipments.createdAt))
      .limit(100);
  }
}
