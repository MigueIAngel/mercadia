import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Currency } from '@mercadia/contracts';
import { CONFIG, type PaymentsConfig } from '../config.js';

export interface OrderForPayment {
  id: string;
  number: number;
  buyerId: string;
  buyerEmail: string;
  status: string;
  currency: Currency;
  fxRate: number;
  total: number;
  paymentDeadline: string;
  sellers: {
    sellerOrderId: string;
    storeId: string;
    storeName: string;
    total: number;
    commission: number;
    refunded: number;
    status: string;
  }[];
}

@Injectable()
export class OrdersClient {
  constructor(@Inject(CONFIG) private readonly config: PaymentsConfig) {}

  async get(orderId: string): Promise<OrderForPayment> {
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
    return (await response.json()) as OrderForPayment;
  }
}
