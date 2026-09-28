import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIG, type OrdersConfig } from '../config.js';

export interface ParcelRequest {
  storeId: string;
  weightGrams: number;
  subtotalUsd: number;
}

export interface ShippingRate {
  storeId: string;
  costUsd: number;
  etaDays: number;
  carrier: string;
}

/**
 * Shipping rates come from the fulfillment service. If it is down, checkout still works
 * with a conservative flat rate instead of failing the sale.
 */
@Injectable()
export class FulfillmentClient {
  private readonly logger = new Logger(FulfillmentClient.name);

  constructor(@Inject(CONFIG) private readonly config: OrdersConfig) {}

  async rates(
    destination: { city: string; department: string },
    parcels: ParcelRequest[],
  ): Promise<ShippingRate[]> {
    try {
      const response = await fetch(`${this.config.fulfillmentUrl}/internal/rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-key': this.config.internalKey },
        // Only what pricing needs; the full address never leaves orders here.
        body: JSON.stringify({ destination: { city: destination.city, department: destination.department }, parcels }),
        signal: AbortSignal.timeout(4000),
      });
      if (response.ok) return (await response.json()) as ShippingRate[];
      this.logger.warn(`fulfillment rates responded ${response.status}, using flat rate`);
    } catch {
      this.logger.warn('fulfillment unavailable, using flat rate');
    }
    return parcels.map((p) => ({
      storeId: p.storeId,
      costUsd: p.subtotalUsd >= 6000 ? 0 : 400,
      etaDays: 5,
      carrier: 'Estándar',
    }));
  }
}
