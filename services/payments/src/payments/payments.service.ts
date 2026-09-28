import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import type pg from 'pg';
import { convert, type Currency, type EventPayloads, type EventType } from '@mercadia/contracts';
import { EventBus, stageEvent, type AuthUser } from '@mercadia/service-kit';
import { OrdersClient } from '../clients/orders.client.js';
import { CONFIG, type PaymentsConfig } from '../config.js';
import { DB, POOL, type Database } from '../db/database.module.js';
import { connectedAccounts, payments, refunds, transfers, type Payment } from '../db/schema.js';
import { simulateCharge } from '../providers/mock.provider.js';
import { PaymentProvider } from '../providers/payment-provider.js';

type Tx = pg.PoolClient;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(POOL) private readonly pool: pg.Pool,
    @Inject(CONFIG) private readonly config: PaymentsConfig,
    private readonly provider: PaymentProvider,
    private readonly orders: OrdersClient,
    private readonly bus: EventBus,
  ) {}

  private async tx<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
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

  private stage<T extends EventType>(tx: Tx, type: T, data: EventPayloads[T], orderId: string) {
    return stageEvent(tx, this.bus.build(type, data, orderId));
  }

  private view(p: Payment, clientSecret: string | null = null) {
    return {
      id: p.id,
      orderId: p.orderId,
      provider: p.provider,
      status: p.status,
      amount: p.amount,
      refunded: p.refunded,
      currency: p.currency,
      failureReason: p.failureReason,
      card: p.cardLast4 ? { brand: p.cardBrand, last4: p.cardLast4 } : null,
      clientSecret,
      publishableKey: this.provider.publishableKey,
    };
  }

  /** Creates (or resumes) the payment for an order the buyer placed. */
  async startPayment(orderId: string, user: AuthUser) {
    const order = await this.orders.get(orderId);
    if (order.buyerId !== user.sub) throw new ForbiddenException();
    const [existing] = await this.db.select().from(payments).where(eq(payments.orderId, orderId));
    if (existing && existing.status !== 'failed') {
      const secret =
        existing.status === 'requires_payment' && existing.providerRef
          ? await this.provider.clientSecret(existing.providerRef)
          : null;
      return this.view(existing, secret);
    }
    if (order.status !== 'pending_payment') throw new ConflictException(`Order is ${order.status}`);

    const intent = await this.provider.createIntent({
      orderId,
      amount: order.total,
      currency: order.currency,
      buyerEmail: order.buyerEmail,
    });
    const [payment] = existing
      ? await this.db
          .update(payments)
          .set({
            status: 'requires_payment',
            providerRef: intent.ref,
            failureReason: null,
            updatedAt: new Date(),
          })
          .where(eq(payments.id, existing.id))
          .returning()
      : await this.db
          .insert(payments)
          .values({
            orderId,
            buyerId: user.sub,
            provider: this.provider.name,
            providerRef: intent.ref,
            amount: order.total,
            currency: order.currency,
          })
          .returning();
    return this.view(payment, intent.clientSecret);
  }

  async status(orderId: string, user: AuthUser) {
    const [payment] = await this.db.select().from(payments).where(eq(payments.orderId, orderId));
    if (!payment) throw new NotFoundException();
    if (payment.buyerId !== user.sub && !user.roles.includes('admin'))
      throw new ForbiddenException();
    return this.view(payment);
  }

  /** Simulated processor: Stripe's test cards decide the result. */
  async confirmMock(
    paymentId: string,
    user: AuthUser,
    card: { number: string; expMonth: number; expYear: number; cvc: string },
  ) {
    if (this.provider.name !== 'mock') throw new BadRequestException('Use Stripe Elements to pay');
    const [payment] = await this.db.select().from(payments).where(eq(payments.id, paymentId));
    if (!payment || payment.buyerId !== user.sub) throw new NotFoundException();
    if (payment.status !== 'requires_payment')
      throw new ConflictException(`Payment is ${payment.status}`);
    const outcome = simulateCharge(card);
    const last4 = card.number.replace(/\s+/g, '').slice(-4);
    if (outcome.ok) await this.succeed(payment.providerRef!, { brand: outcome.brand, last4 });
    else await this.fail(payment.providerRef!, outcome.reason, last4);
    const [updated] = await this.db.select().from(payments).where(eq(payments.id, paymentId));
    return this.view(updated);
  }

  /** Payment captured: record the seller shares as held transfers (escrow). */
  async succeed(providerRef: string, card?: { brand: string; last4: string }) {
    const [payment] = await this.db
      .select()
      .from(payments)
      .where(eq(payments.providerRef, providerRef));
    if (!payment || payment.status === 'succeeded') return;
    const order = await this.orders.get(payment.orderId);
    await this.tx(async (tx) => {
      const { rowCount } = await tx.query(
        `UPDATE payments SET status = 'succeeded', card_brand = $2, card_last4 = $3, failure_reason = NULL, updated_at = now()
         WHERE id = $1 AND status = 'requires_payment'`,
        [payment.id, card?.brand ?? null, card?.last4 ?? null],
      );
      if (!rowCount) return;
      for (const s of order.sellers) {
        await tx.query(
          `INSERT INTO transfers (payment_id, order_id, seller_order_id, store_id, store_name, gross, commission, amount, currency)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (seller_order_id) DO NOTHING`,
          [
            payment.id,
            order.id,
            s.sellerOrderId,
            s.storeId,
            s.storeName,
            s.total,
            s.commission,
            s.total - s.commission,
            order.currency,
          ],
        );
      }
      await this.stage(
        tx,
        'payment.succeeded',
        {
          orderId: order.id,
          paymentId: payment.id,
          amount: payment.amount,
          currency: payment.currency as Currency,
        },
        order.id,
      );
    });
  }

  async fail(providerRef: string, reason: string, last4?: string) {
    await this.tx(async (tx) => {
      const { rows } = await tx.query<{ id: string; order_id: string }>(
        `UPDATE payments SET status = 'failed', failure_reason = $2, card_last4 = coalesce($3, card_last4), updated_at = now()
         WHERE provider_ref = $1 AND status = 'requires_payment' RETURNING id, order_id`,
        [providerRef, reason, last4 ?? null],
      );
      if (rows[0])
        await this.stage(
          tx,
          'payment.failed',
          { orderId: rows[0].order_id, paymentId: rows[0].id, reason },
          rows[0].order_id,
        );
    });
  }

  /** Cancelled order: void the intent, or refund everything if it was already paid. */
  async onOrderCancelled(orderId: string) {
    const [payment] = await this.db.select().from(payments).where(eq(payments.orderId, orderId));
    if (!payment) return;
    if (payment.status === 'requires_payment') {
      if (payment.providerRef) await this.provider.cancelIntent(payment.providerRef);
      await this.db
        .update(payments)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(payments.id, payment.id));
      return;
    }
    if (payment.status !== 'succeeded' && payment.status !== 'partially_refunded') return;
    const order = await this.orders.get(orderId);
    for (const s of order.sellers) {
      const remaining = s.total - s.refunded;
      if (remaining > 0)
        await this.refund(
          payment,
          s.sellerOrderId,
          remaining,
          'order_cancelled',
          `cancel:${s.sellerOrderId}`,
        );
    }
  }

  /**
   * Refunds part of a payment for one seller order. `sourceId` (dispute or cancellation)
   * makes it idempotent. Held money is taken back from the seller's pending transfer.
   */
  async refund(
    payment: Payment,
    sellerOrderId: string,
    amount: number,
    reason: string,
    sourceId: string,
  ) {
    if (amount <= 0) return;
    const [done] = await this.db.select().from(refunds).where(eq(refunds.sourceId, sourceId));
    if (done) return;
    const allowed = Math.min(amount, payment.amount - payment.refunded);
    if (allowed <= 0) return;
    const result = await this.provider.refund(payment.providerRef!, allowed, reason);
    await this.tx(async (tx) => {
      await tx.query(
        `INSERT INTO refunds (payment_id, seller_order_id, amount, reason, provider_ref, source_id) VALUES ($1,$2,$3,$4,$5,$6)`,
        [payment.id, sellerOrderId, allowed, reason, result.ref, sourceId],
      );
      const { rows } = await tx.query<{ amount: number; refunded: number }>(
        `UPDATE payments SET refunded = refunded + $2, updated_at = now() WHERE id = $1 RETURNING amount, refunded`,
        [payment.id, allowed],
      );
      const status = rows[0].refunded >= rows[0].amount ? 'refunded' : 'partially_refunded';
      await tx.query('UPDATE payments SET status = $2 WHERE id = $1', [payment.id, status]);
      await tx.query(
        `UPDATE transfers SET amount = GREATEST(0, amount - $2),
           status = CASE WHEN amount - $2 <= 0 AND status = 'held' THEN 'reversed' ELSE status END
         WHERE seller_order_id = $1 AND status = 'held'`,
        [sellerOrderId, allowed],
      );
      await this.stage(
        tx,
        'refund.succeeded',
        {
          orderId: payment.orderId,
          sellerOrderId,
          amount: allowed,
          currency: payment.currency as Currency,
        },
        payment.orderId,
      );
    });
    payment.refunded += allowed;
  }

  async onDisputeResolved(data: EventPayloads['dispute.resolved']) {
    if (data.resolution === 'rejected' || data.refundAmount <= 0) return;
    const [payment] = await this.db
      .select()
      .from(payments)
      .where(eq(payments.orderId, data.orderId));
    if (!payment) return;
    await this.refund(
      payment,
      data.sellerOrderId,
      data.refundAmount,
      `dispute_${data.resolution}`,
      `dispute:${data.disputeId}`,
    );
  }

  /** Delivered: release the seller's share (a Stripe Transfer to their Connect account). */
  async release(sellerOrderId: string) {
    const [transfer] = await this.db
      .select()
      .from(transfers)
      .where(and(eq(transfers.sellerOrderId, sellerOrderId), eq(transfers.status, 'held')));
    if (!transfer) return;
    const [account] = await this.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.storeId, transfer.storeId));
    let ref: string | null = null;
    if (this.provider.name === 'stripe' && account?.providerAccountId && transfer.amount > 0) {
      // Stripe settles the platform balance in USD.
      const [payment] = await this.db
        .select()
        .from(payments)
        .where(eq(payments.id, transfer.paymentId));
      const order = await this.orders.get(payment.orderId);
      const amountUsd = convert(
        transfer.amount,
        transfer.currency as Currency,
        'USD',
        order.fxRate,
      );
      ref = (
        await this.provider.transfer({
          amount: amountUsd,
          currency: 'USD',
          destination: account.providerAccountId,
          transferGroup: transfer.orderId,
          sellerOrderId,
        })
      ).ref;
    } else if (transfer.amount > 0) {
      ref = (
        await this.provider.transfer({
          amount: transfer.amount,
          currency: transfer.currency as Currency,
          destination: account?.providerAccountId ?? 'mock',
          transferGroup: transfer.orderId,
          sellerOrderId,
        })
      ).ref;
    }
    await this.db
      .update(transfers)
      .set({ status: 'released', releasedAt: new Date(), providerRef: ref })
      .where(eq(transfers.id, transfer.id));
    this.logger.log(`released ${transfer.amount} ${transfer.currency} to ${transfer.storeName}`);
  }

  // ----- sellers -----

  async payouts(storeId: string) {
    const list = await this.db
      .select()
      .from(transfers)
      .where(eq(transfers.storeId, storeId))
      .orderBy(desc(transfers.createdAt))
      .limit(100);
    const [totals] = await this.db
      .select({
        held: sql<number>`coalesce(sum(${transfers.amount}) FILTER (WHERE ${transfers.status} = 'held' AND ${transfers.currency} = 'COP'), 0)::bigint`,
        released: sql<number>`coalesce(sum(${transfers.amount}) FILTER (WHERE ${transfers.status} = 'released' AND ${transfers.currency} = 'COP'), 0)::bigint`,
        commission: sql<number>`coalesce(sum(${transfers.commission}) FILTER (WHERE ${transfers.currency} = 'COP'), 0)::bigint`,
      })
      .from(transfers)
      .where(eq(transfers.storeId, storeId));
    const [account] = await this.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.storeId, storeId));
    return {
      provider: this.provider.name,
      payoutsEnabled: account?.payoutsEnabled ?? false,
      totals: {
        currency: 'COP',
        held: Number(totals.held),
        released: Number(totals.released),
        commission: Number(totals.commission),
      },
      transfers: list,
    };
  }

  async onboard(user: AuthUser) {
    const returnUrl = `${this.config.siteUrl}/es/seller/payouts`;
    const result = await this.provider.onboarding(user.storeId!, user.email, returnUrl);
    const enabled = this.provider.name === 'mock';
    await this.db
      .insert(connectedAccounts)
      .values({
        storeId: user.storeId!,
        provider: this.provider.name,
        providerAccountId: result.accountId,
        payoutsEnabled: enabled,
      })
      .onConflictDoUpdate({
        target: connectedAccounts.storeId,
        set: {
          providerAccountId: result.accountId,
          payoutsEnabled: enabled,
          updatedAt: new Date(),
        },
      });
    if (enabled) await this.bus.publish('store.payouts_enabled', { storeId: user.storeId! });
    return { url: result.url, payoutsEnabled: enabled };
  }

  async accountUpdated(accountId: string, payoutsEnabled: boolean) {
    const [account] = await this.db
      .update(connectedAccounts)
      .set({ payoutsEnabled, updatedAt: new Date() })
      .where(eq(connectedAccounts.providerAccountId, accountId))
      .returning();
    if (account && payoutsEnabled)
      await this.bus.publish('store.payouts_enabled', { storeId: account.storeId });
  }

  adminList() {
    return this.db.select().from(payments).orderBy(desc(payments.createdAt)).limit(100);
  }
}
