import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EventBus } from '@mercadia/service-kit';
import { DB, type Database } from '../db/database.module.js';
import { sellerOrders } from '../db/schema.js';

/** Keeps a local copy of each seller order's status (from orders events). */
@Injectable()
export class SellerOrdersProjection implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly bus: EventBus,
  ) {}

  onModuleInit() {
    this.bus.on('seller_order.status_changed', async ({ data }) => {
      await this.db
        .insert(sellerOrders)
        .values({
          id: data.sellerOrderId,
          orderId: data.orderId,
          storeId: data.storeId,
          buyerId: data.buyerId,
          status: data.status,
        })
        .onConflictDoUpdate({
          target: sellerOrders.id,
          set: { status: data.status, updatedAt: new Date() },
        });
    });
  }
}
