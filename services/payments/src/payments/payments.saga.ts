import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventBus } from '@mercadia/service-kit';
import { PaymentsService } from './payments.service.js';

@Injectable()
export class PaymentsSaga implements OnModuleInit {
  constructor(
    private readonly bus: EventBus,
    private readonly payments: PaymentsService,
  ) {}

  onModuleInit() {
    this.bus.on('order.cancelled', ({ data }) => this.payments.onOrderCancelled(data.orderId));
    this.bus.on('dispute.resolved', ({ data }) => this.payments.onDisputeResolved(data));
    this.bus.on('seller_order.status_changed', async ({ data }) => {
      if (data.status === 'delivered') await this.payments.release(data.sellerOrderId);
    });
  }
}
