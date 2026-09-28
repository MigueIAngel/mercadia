import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventBus } from '@mercadia/service-kit';
import type { SellerOrderStatus } from '../db/schema.js';
import { OrdersService } from '../orders/orders.service.js';

const SHIPMENT_TO_SELLER_STATUS: Record<string, SellerOrderStatus> = {
  label_created: 'processing',
  in_transit: 'shipped',
  out_for_delivery: 'shipped',
  delivered: 'delivered',
};

/**
 * Orders' side of the saga: reacts to stock, payment, shipping and refund events.
 * Every transition is idempotent (it checks the current status inside a transaction).
 */
@Injectable()
export class OrderSaga implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderSaga.name);
  private sweeper?: NodeJS.Timeout;

  constructor(
    private readonly bus: EventBus,
    private readonly orders: OrdersService,
  ) {}

  onModuleInit() {
    this.bus.on('stock.rejected', ({ data }) =>
      this.orders.cancel(data.orderId, `out_of_stock${data.sku ? `:${data.sku}` : ''}`),
    );
    this.bus.on('payment.succeeded', ({ data }) => this.orders.markPaid(data.orderId));
    this.bus.on('shipment.status_changed', async ({ data }) => {
      const status = SHIPMENT_TO_SELLER_STATUS[data.status];
      if (status)
        await this.orders.setSellerStatus(
          data.sellerOrderId,
          status,
          `Shipment ${data.status}`,
          data.trackingNumber,
        );
    });
    this.bus.on('refund.succeeded', ({ data }) =>
      this.orders.applyRefund(data.sellerOrderId, data.amount),
    );
    this.sweeper = setInterval(async () => {
      try {
        const n = await this.orders.cancelExpired();
        if (n) this.logger.log(`cancelled ${n} unpaid order(s)`);
      } catch (error) {
        this.logger.error(`expiry sweep failed: ${String(error)}`);
      }
    }, 60_000);
  }

  onModuleDestroy() {
    clearInterval(this.sweeper);
  }
}
