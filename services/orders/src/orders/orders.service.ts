import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type pg from 'pg';
import { EventBus, type AuthUser } from '@mercadia/service-kit';
import { DB, POOL, type Database } from '../db/database.module.js';
import {
  orderLines,
  orders,
  sellerOrders,
  statusHistory,
  type OrderStatus,
  type SellerOrderStatus,
} from '../db/schema.js';
import { stage } from './order-events.js';

type Tx = pg.PoolClient;

@Injectable()
export class OrdersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(POOL) private readonly pool: pg.Pool,
    private readonly bus: EventBus,
  ) {}

  // ---------------- reads ----------------

  private async load(orderId: string) {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) throw new NotFoundException('Order not found');
    const [sellers, lines, history] = await Promise.all([
      this.db
        .select()
        .from(sellerOrders)
        .where(eq(sellerOrders.orderId, orderId))
        .orderBy(asc(sellerOrders.storeName)),
      this.db
        .select()
        .from(orderLines)
        .where(eq(orderLines.orderId, orderId))
        .orderBy(asc(orderLines.id)),
      this.db
        .select()
        .from(statusHistory)
        .where(eq(statusHistory.orderId, orderId))
        .orderBy(asc(statusHistory.id)),
    ]);
    return {
      ...order,
      fxRate: Number(order.fxRate),
      sellerOrders: sellers.map((s) => ({
        ...s,
        lines: lines
          .filter((l) => l.sellerOrderId === s.id)
          .map((l) => ({ ...l, taxRate: Number(l.taxRate) })),
      })),
      history,
    };
  }

  /** Buyers see their orders, sellers the orders containing their store, admins everything. */
  async detail(orderId: string, user: AuthUser) {
    const order = await this.load(orderId);
    const isBuyer = order.buyerId === user.sub;
    const isAdmin = user.roles.includes('admin');
    const isSeller = !!user.storeId && order.sellerOrders.some((s) => s.storeId === user.storeId);
    if (!isBuyer && !isAdmin && !isSeller) throw new ForbiddenException();
    if (!isBuyer && !isAdmin) {
      return {
        ...order,
        sellerOrders: order.sellerOrders.filter((s) => s.storeId === user.storeId),
      };
    }
    return order;
  }

  async mine(buyerId: string) {
    const list = await this.db
      .select()
      .from(orders)
      .where(eq(orders.buyerId, buyerId))
      .orderBy(desc(orders.createdAt))
      .limit(50);
    if (list.length === 0) return [];
    const lines = await this.db
      .select({
        orderId: orderLines.orderId,
        title: orderLines.title,
        image: orderLines.image,
        quantity: orderLines.quantity,
      })
      .from(orderLines)
      .where(
        inArray(
          orderLines.orderId,
          list.map((o) => o.id),
        ),
      );
    return list.map((o) => ({
      ...o,
      fxRate: Number(o.fxRate),
      items: lines.filter((l) => l.orderId === o.id),
    }));
  }

  async sellerList(storeId: string, status?: SellerOrderStatus) {
    const rows = await this.db
      .select({
        seller: sellerOrders,
        order: {
          id: orders.id,
          number: orders.number,
          buyerName: orders.buyerName,
          currency: orders.currency,
          createdAt: orders.createdAt,
          city: sql<string>`${orders.shippingAddress}->>'city'`,
        },
      })
      .from(sellerOrders)
      .innerJoin(orders, eq(orders.id, sellerOrders.orderId))
      .where(
        and(
          eq(sellerOrders.storeId, storeId),
          status ? eq(sellerOrders.status, status) : undefined,
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(100);
    const lines = rows.length
      ? await this.db
          .select()
          .from(orderLines)
          .where(
            inArray(
              orderLines.sellerOrderId,
              rows.map((r) => r.seller.id),
            ),
          )
      : [];
    return rows.map((r) => ({
      ...r.seller,
      order: r.order,
      lines: lines.filter((l) => l.sellerOrderId === r.seller.id),
    }));
  }

  /** Revenue per day and totals for the seller dashboard (last 30 days). */
  async sellerSales(storeId: string) {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const byDay = await this.db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${orders.createdAt}), 'YYYY-MM-DD')`,
        revenueCop: sql<number>`sum(CASE WHEN ${orders.currency} = 'COP' THEN ${sellerOrders.subtotal} ELSE round(${sellerOrders.subtotal} * ${orders.fxRate}) END)::bigint`,
        orders: sql<number>`count(*)::int`,
      })
      .from(sellerOrders)
      .innerJoin(orders, eq(orders.id, sellerOrders.orderId))
      .where(
        and(
          eq(sellerOrders.storeId, storeId),
          gte(orders.createdAt, since),
          inArray(sellerOrders.status, ['paid', 'processing', 'shipped', 'delivered']),
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`1`);
    const [pending] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(sellerOrders)
      .where(
        and(
          eq(sellerOrders.storeId, storeId),
          inArray(sellerOrders.status, ['paid', 'processing']),
        ),
      );
    return {
      currency: 'COP',
      days: byDay.map((d) => ({ ...d, revenueCop: Number(d.revenueCop) })),
      revenue30d: byDay.reduce((n, d) => n + Number(d.revenueCop), 0),
      orders30d: byDay.reduce((n, d) => n + d.orders, 0),
      toShip: pending.n,
    };
  }

  async adminList(status?: OrderStatus) {
    return this.db
      .select()
      .from(orders)
      .where(status ? eq(orders.status, status) : undefined)
      .orderBy(desc(orders.createdAt))
      .limit(100);
  }

  async adminStats() {
    const [row] = await this.db
      .select({
        orders: sql<number>`count(*)::int`,
        paid: sql<number>`count(*) FILTER (WHERE ${orders.status} IN ('paid','completed','partially_refunded'))::int`,
        gmvCop: sql<number>`coalesce(sum(CASE WHEN ${orders.status} IN ('paid','completed','partially_refunded') THEN (CASE WHEN ${orders.currency}='COP' THEN ${orders.total} ELSE round(${orders.total} * ${orders.fxRate}) END) END), 0)::bigint`,
        cancelled: sql<number>`count(*) FILTER (WHERE ${orders.status} = 'cancelled')::int`,
      })
      .from(orders);
    const [fees] = await this.db
      .select({
        commissionCop: sql<number>`coalesce(sum(CASE WHEN ${orders.currency}='COP' THEN ${sellerOrders.commission} ELSE round(${sellerOrders.commission} * ${orders.fxRate}) END), 0)::bigint`,
      })
      .from(sellerOrders)
      .innerJoin(orders, eq(orders.id, sellerOrders.orderId))
      .where(inArray(sellerOrders.status, ['paid', 'processing', 'shipped', 'delivered']));
    return { ...row, gmvCop: Number(row.gmvCop), commissionCop: Number(fees.commissionCop) };
  }

  /** What payments needs to charge and split an order. */
  async forPayment(orderId: string) {
    const order = await this.load(orderId);
    return {
      id: order.id,
      number: order.number,
      buyerId: order.buyerId,
      buyerEmail: order.buyerEmail,
      status: order.status,
      currency: order.currency,
      fxRate: order.fxRate,
      total: order.total,
      paymentDeadline: order.paymentDeadline,
      sellers: order.sellerOrders.map((s) => ({
        sellerOrderId: s.id,
        storeId: s.storeId,
        storeName: s.storeName,
        total: s.total,
        commission: s.commission,
        refunded: s.refunded,
        status: s.status,
      })),
    };
  }

  /** Verified-purchase check used by reviews. */
  async hasPurchased(buyerId: string, productId: string) {
    const [row] = await this.db
      .select({ id: orderLines.id })
      .from(orderLines)
      .innerJoin(sellerOrders, eq(sellerOrders.id, orderLines.sellerOrderId))
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .where(
        and(
          eq(orders.buyerId, buyerId),
          eq(orderLines.productId, productId),
          inArray(sellerOrders.status, ['shipped', 'delivered']),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  // ---------------- transitions ----------------

  private async inTx<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private history(
    tx: Tx,
    orderId: string,
    status: string,
    note: string | null,
    sellerOrderId: string | null = null,
  ) {
    return tx.query(
      'INSERT INTO status_history (order_id, seller_order_id, status, note) VALUES ($1, $2, $3, $4)',
      [orderId, sellerOrderId, status, note],
    );
  }

  async markPaid(orderId: string) {
    await this.inTx(async (tx) => {
      const { rows } = await tx.query<{ status: OrderStatus; buyer_id: string }>(
        'SELECT status, buyer_id FROM orders WHERE id = $1 FOR UPDATE',
        [orderId],
      );
      const order = rows[0];
      if (!order) return;
      if (order.status === 'cancelled') {
        // Paid after the window closed: announce the cancellation again so payments refunds it.
        await stage(
          this.bus,
          tx,
          'order.cancelled',
          { orderId, buyerId: order.buyer_id, reason: 'paid_after_cancellation' },
          orderId,
        );
        return;
      }
      if (order.status !== 'pending_payment') return;
      await tx.query(
        `UPDATE orders SET status = 'paid', paid_at = now(), updated_at = now() WHERE id = $1`,
        [orderId],
      );
      const { rows: sellers } = await tx.query<{ id: string; store_id: string }>(
        `UPDATE seller_orders SET status = 'paid', updated_at = now() WHERE order_id = $1 RETURNING id, store_id`,
        [orderId],
      );
      await this.history(tx, orderId, 'paid', 'Payment captured');
      await stage(this.bus, tx, 'order.paid', { orderId, buyerId: order.buyer_id }, orderId);
      for (const s of sellers) {
        await stage(
          this.bus,
          tx,
          'seller_order.status_changed',
          {
            orderId,
            sellerOrderId: s.id,
            storeId: s.store_id,
            buyerId: order.buyer_id,
            status: 'paid',
          },
          orderId,
        );
      }
    });
  }

  async cancel(orderId: string, reason: string) {
    return this.inTx(async (tx) => {
      const { rows } = await tx.query<{ status: OrderStatus; buyer_id: string }>(
        'SELECT status, buyer_id FROM orders WHERE id = $1 FOR UPDATE',
        [orderId],
      );
      if (rows[0]?.status !== 'pending_payment') return false;
      await tx.query(
        `UPDATE orders SET status = 'cancelled', cancel_reason = $2, updated_at = now() WHERE id = $1`,
        [orderId, reason],
      );
      await tx.query(
        `UPDATE seller_orders SET status = 'cancelled', updated_at = now() WHERE order_id = $1`,
        [orderId],
      );
      await this.history(tx, orderId, 'cancelled', reason);
      await stage(
        this.bus,
        tx,
        'order.cancelled',
        { orderId, buyerId: rows[0].buyer_id, reason },
        orderId,
      );
      return true;
    });
  }

  async cancelByBuyer(orderId: string, user: AuthUser) {
    const order = await this.load(orderId);
    if (order.buyerId !== user.sub) throw new ForbiddenException();
    if (!(await this.cancel(orderId, 'cancelled_by_buyer')))
      throw new BadRequestException('Only unpaid orders can be cancelled');
    return this.detail(orderId, user);
  }

  /** The seller accepts a paid order and starts preparing it. */
  async sellerAccept(sellerOrderId: string, user: AuthUser) {
    const [so] = await this.db
      .select()
      .from(sellerOrders)
      .where(eq(sellerOrders.id, sellerOrderId));
    if (!so || so.storeId !== user.storeId) throw new NotFoundException();
    if (so.status !== 'paid') throw new BadRequestException('Only paid orders can be accepted');
    await this.setSellerStatus(so.id, 'processing', 'Seller is preparing the order');
    return { id: so.id, status: 'processing' };
  }

  async setSellerStatus(
    sellerOrderId: string,
    status: SellerOrderStatus,
    note: string | null,
    trackingNumber?: string,
  ) {
    await this.inTx(async (tx) => {
      const { rows } = await tx.query<{
        order_id: string;
        store_id: string;
        status: SellerOrderStatus;
      }>('SELECT order_id, store_id, status FROM seller_orders WHERE id = $1 FOR UPDATE', [
        sellerOrderId,
      ]);
      const current = rows[0];
      if (
        !current ||
        current.status === status ||
        ['cancelled', 'refunded'].includes(current.status)
      )
        return;
      await tx.query(
        'UPDATE seller_orders SET status = $2, tracking_number = coalesce($3, tracking_number), updated_at = now() WHERE id = $1',
        [sellerOrderId, status, trackingNumber ?? null],
      );
      await this.history(tx, current.order_id, status, note, sellerOrderId);
      const { rows: order } = await tx.query<{ buyer_id: string }>(
        'SELECT buyer_id FROM orders WHERE id = $1',
        [current.order_id],
      );
      await stage(
        this.bus,
        tx,
        'seller_order.status_changed',
        {
          orderId: current.order_id,
          sellerOrderId,
          storeId: current.store_id,
          buyerId: order[0].buyer_id,
          status,
        },
        current.order_id,
      );
      // The order is complete once every seller has delivered.
      const { rows: open } = await tx.query(
        `SELECT 1 FROM seller_orders WHERE order_id = $1 AND status NOT IN ('delivered', 'cancelled', 'refunded')`,
        [current.order_id],
      );
      if (open.length === 0 && status === 'delivered') {
        await tx.query(
          `UPDATE orders SET status = 'completed', updated_at = now() WHERE id = $1 AND status = 'paid'`,
          [current.order_id],
        );
        await this.history(tx, current.order_id, 'completed', null);
      }
    });
  }

  async applyRefund(sellerOrderId: string, amount: number) {
    await this.inTx(async (tx) => {
      const { rows } = await tx.query<{ order_id: string; total: number; refunded: number }>(
        'UPDATE seller_orders SET refunded = LEAST(total, refunded + $2), updated_at = now() WHERE id = $1 RETURNING order_id, total, refunded',
        [sellerOrderId, amount],
      );
      if (!rows[0]) return;
      const { order_id: orderId, total, refunded } = rows[0];
      if (refunded >= total)
        await tx.query(`UPDATE seller_orders SET status = 'refunded' WHERE id = $1`, [
          sellerOrderId,
        ]);
      const { rows: sums } = await tx.query<{ total: number; refunded: number }>(
        'SELECT sum(total)::int AS total, sum(refunded)::int AS refunded FROM seller_orders WHERE order_id = $1',
        [orderId],
      );
      const status = sums[0].refunded >= sums[0].total ? 'refunded' : 'partially_refunded';
      await tx.query('UPDATE orders SET status = $2, updated_at = now() WHERE id = $1', [
        orderId,
        status,
      ]);
      await this.history(tx, orderId, status, `Refund of ${amount}`, sellerOrderId);
    });
  }

  /** Unpaid orders past their payment window are cancelled; the stock goes back. */
  async cancelExpired() {
    const expired = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.status, 'pending_payment'), sql`${orders.paymentDeadline} < now()`))
      .limit(50);
    for (const o of expired) await this.cancel(o.id, 'payment_timeout');
    return expired.length;
  }
}
