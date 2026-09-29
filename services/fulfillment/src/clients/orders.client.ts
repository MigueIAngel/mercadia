import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Currency } from '@mercadia/contracts';
import { CONFIG, type FulfillmentConfig } from '../config.js';
import type { Destination } from '../db/schema.js';

export interface InternalOrder {
  id: string;
  buyerId: string;
  currency: Currency;
  shippingAddress: Destination;
  sellers: {
    sellerOrderId: string;
    storeId: string;
    total: number;
    refunded: number;
    status: string;
  }[];
}

@Injectable()
export class OrdersClient {
  constructor(@Inject(CONFIG) private readonly config: FulfillmentConfig) {}

  async get(orderId: string): Promise<InternalOrder> {
    let response: Response;
    try {
      response = await fetch(`${this.config.ordersUrl}/internal/orders/${orderId}`, {
        headers: { 'x-internal-key': this.config.internalKey },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new ServiceUnavailableException('Orders service is unavailable');
    }
    if (response.status === 404) throw new NotFoundException('Order not found');
    if (!response.ok) throw new ServiceUnavailableException(`Orders responded ${response.status}`);
    return (await response.json()) as InternalOrder;
  }
}
