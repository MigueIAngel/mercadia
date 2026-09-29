import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, lte } from 'drizzle-orm';
import type pg from 'pg';
import type { EventPayloads } from '@mercadia/contracts';
import { EventBus, stageEvent, type AuthUser } from '@mercadia/service-kit';
import { OrdersClient } from '../clients/orders.client.js';
import { CONFIG, type FulfillmentConfig } from '../config.js';
import { DB, POOL, type Database } from '../db/database.module.js';
import { disputeMessages, disputes, sellerOrders, type Dispute } from '../db/schema.js';

type Resolution = EventPayloads['dispute.resolved']['resolution'];
const WINDOW_DAYS = 30;

/**
 * Returns and disputes: the buyer opens a case about one seller order, the seller can accept
 * (refund) or reject, and a rejected or unanswered case goes to an admin, whose decision
 * triggers the refund in payments (`dispute.resolved`).
 */
@Injectable()
export class DisputesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DisputesService.name);
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
      () => void this.escalateOverdue().catch((e) => this.logger.error(String(e))),
      60_000,
    );
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  private async load(id: string) {
    const [dispute] = await this.db.select().from(disputes).where(eq(disputes.id, id));
    if (!dispute) throw new NotFoundException('Dispute not found');
    return dispute;
  }

  private role(dispute: Dispute, user: AuthUser): 'buyer' | 'seller' | 'admin' {
    if (dispute.buyerId === user.sub) return 'buyer';
    if (dispute.storeId === user.storeId) return 'seller';
    if (user.roles.includes('admin')) return 'admin';
    throw new ForbiddenException();
  }

  async open(
    user: AuthUser,
    input: { sellerOrderId: string; reason: string; description: string; amount?: number },
  ) {
    const [so] = await this.db
      .select()
      .from(sellerOrders)
      .where(eq(sellerOrders.id, input.sellerOrderId));
    if (!so || so.buyerId !== user.sub) throw new NotFoundException('Order not found');
    if (!['shipped', 'delivered'].includes(so.status))
      throw new BadRequestException('You can open a case once the order has shipped');
    if (
      so.status === 'delivered' &&
      Date.now() - so.updatedAt.getTime() > WINDOW_DAYS * 86_400_000
    ) {
      throw new BadRequestException(`Cases can be opened up to ${WINDOW_DAYS} days after delivery`);
    }
    const [open] = await this.db
      .select({ id: disputes.id })
      .from(disputes)
      .where(
        and(
          eq(disputes.sellerOrderId, so.id),
          inArray(disputes.status, ['open', 'seller_rejected', 'escalated']),
        ),
      );
    if (open) throw new ConflictException('There is already an open case for this order');

    const order = await this.orders.get(so.orderId);
    const seller = order.sellers.find((s) => s.sellerOrderId === so.id)!;
    const max = seller.total - seller.refunded;
    const requested = Math.min(input.amount ?? max, max);
    if (requested <= 0) throw new BadRequestException('Nothing left to refund on this order');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO disputes (order_id, seller_order_id, store_id, buyer_id, reason, description, requested_amount, max_amount, currency, seller_deadline)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now() + ($10 || ' hours')::interval) RETURNING id`,
        [
          so.orderId,
          so.id,
          so.storeId,
          user.sub,
          input.reason,
          input.description,
          requested,
          max,
          order.currency,
          String(this.config.sellerResponseHours),
        ],
      );
      await client.query(
        `INSERT INTO dispute_messages (dispute_id, author_id, author_role, text) VALUES ($1,$2,'buyer',$3)`,
        [rows[0].id, user.sub, input.description],
      );
      await stageEvent(
        client,
        this.bus.build(
          'dispute.opened',
          { disputeId: rows[0].id, orderId: so.orderId, sellerOrderId: so.id, storeId: so.storeId },
          so.orderId,
        ),
      );
      await client.query('COMMIT');
      return this.detail(rows[0].id, user);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async detail(id: string, user: AuthUser) {
    const dispute = await this.load(id);
    const role = this.role(dispute, user);
    const messages = await this.db
      .select()
      .from(disputeMessages)
      .where(eq(disputeMessages.disputeId, id))
      .orderBy(asc(disputeMessages.id));
    return { ...dispute, viewerRole: role, messages };
  }

  list(user: AuthUser, as: 'buyer' | 'seller') {
    const filter =
      as === 'seller'
        ? eq(disputes.storeId, user.storeId ?? '00000000-0000-0000-0000-000000000000')
        : eq(disputes.buyerId, user.sub);
    return this.db
      .select()
      .from(disputes)
      .where(filter)
      .orderBy(desc(disputes.updatedAt))
      .limit(100);
  }

  adminList() {
    return this.db.select().from(disputes).orderBy(desc(disputes.updatedAt)).limit(100);
  }

  async message(id: string, user: AuthUser, text: string) {
    const dispute = await this.load(id);
    const role = this.role(dispute, user);
    if (dispute.status === 'resolved') throw new BadRequestException('This case is closed');
    await this.db
      .insert(disputeMessages)
      .values({ disputeId: id, authorId: user.sub, authorRole: role, text });
    await this.db.update(disputes).set({ updatedAt: new Date() }).where(eq(disputes.id, id));
    return this.detail(id, user);
  }

  async sellerRespond(id: string, user: AuthUser, action: 'accept' | 'reject', text: string) {
    const dispute = await this.load(id);
    if (this.role(dispute, user) !== 'seller') throw new ForbiddenException();
    if (dispute.status !== 'open')
      throw new BadRequestException('The seller can only answer open cases');
    if (action === 'accept') {
      const resolution: Resolution =
        dispute.requestedAmount >= dispute.maxAmount ? 'refund' : 'partial_refund';
      return this.resolve(
        dispute,
        resolution,
        dispute.requestedAmount,
        user,
        'seller',
        text || 'The seller accepted the refund',
      );
    }
    await this.db
      .update(disputes)
      .set({ status: 'seller_rejected', updatedAt: new Date() })
      .where(eq(disputes.id, id));
    await this.db.insert(disputeMessages).values({
      disputeId: id,
      authorId: user.sub,
      authorRole: 'seller',
      text: text || 'The seller rejected the request',
    });
    return this.detail(id, user);
  }

  async escalate(id: string, user: AuthUser) {
    const dispute = await this.load(id);
    if (this.role(dispute, user) !== 'buyer') throw new ForbiddenException();
    if (!['open', 'seller_rejected'].includes(dispute.status))
      throw new BadRequestException('Cannot escalate this case');
    await this.db
      .update(disputes)
      .set({ status: 'escalated', updatedAt: new Date() })
      .where(eq(disputes.id, id));
    await this.db
      .insert(disputeMessages)
      .values({ disputeId: id, authorRole: 'system', text: 'Case escalated to Mercadia' });
    return this.detail(id, user);
  }

  async adminResolve(
    id: string,
    user: AuthUser,
    resolution: Resolution,
    amount: number,
    text: string,
  ) {
    const dispute = await this.load(id);
    if (dispute.status === 'resolved') throw new BadRequestException('Already resolved');
    const refund =
      resolution === 'rejected'
        ? 0
        : resolution === 'refund'
          ? dispute.maxAmount
          : Math.min(amount, dispute.maxAmount);
    if (resolution === 'partial_refund' && refund <= 0)
      throw new BadRequestException('Partial refunds need an amount');
    return this.resolve(
      dispute,
      resolution,
      refund,
      user,
      'admin',
      text || `Resolved by Mercadia: ${resolution}`,
    );
  }

  private async resolve(
    dispute: Dispute,
    resolution: Resolution,
    refundAmount: number,
    user: AuthUser,
    role: 'seller' | 'admin',
    text: string,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rowCount } = await client.query(
        `UPDATE disputes SET status = 'resolved', resolution = $2, refund_amount = $3, resolved_at = now(), updated_at = now()
         WHERE id = $1 AND status <> 'resolved'`,
        [dispute.id, resolution, refundAmount],
      );
      if (rowCount) {
        await client.query(
          `INSERT INTO dispute_messages (dispute_id, author_id, author_role, text) VALUES ($1,$2,$3,$4)`,
          [dispute.id, user.sub, role, text],
        );
        await stageEvent(
          client,
          this.bus.build(
            'dispute.resolved',
            {
              disputeId: dispute.id,
              orderId: dispute.orderId,
              sellerOrderId: dispute.sellerOrderId,
              resolution,
              refundAmount,
              currency: dispute.currency as 'COP' | 'USD',
            },
            dispute.orderId,
          ),
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.detail(dispute.id, user);
  }

  /** Sellers who never answer lose the chance to: the case goes to an admin. */
  async escalateOverdue() {
    const overdue = await this.db
      .select({ id: disputes.id })
      .from(disputes)
      .where(and(eq(disputes.status, 'open'), lte(disputes.sellerDeadline, new Date())));
    for (const d of overdue) {
      await this.db
        .update(disputes)
        .set({ status: 'escalated', updatedAt: new Date() })
        .where(eq(disputes.id, d.id));
      await this.db.insert(disputeMessages).values({
        disputeId: d.id,
        authorRole: 'system',
        text: 'The seller did not answer in time; escalated to Mercadia',
      });
    }
    return overdue.length;
  }
}
