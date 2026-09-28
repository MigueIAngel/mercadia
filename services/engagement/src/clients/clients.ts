import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIG, type EngagementConfig } from '../config.js';

export interface ProductInfo {
  id: string;
  slug: string;
  title: string;
  image: string | null;
  /** Minor units of `currency` (USD cents unless another currency was asked for). */
  price: number;
  compareAt?: number | null;
  currency?: 'COP' | 'USD';
  inStock?: boolean;
  store: { id: string; name: string; slug: string };
}

/** Small internal clients for the data engagement does not own. */
@Injectable()
export class ServiceClients {
  private readonly logger = new Logger(ServiceClients.name);

  constructor(@Inject(CONFIG) private readonly config: EngagementConfig) {}

  private async json<T>(url: string, init?: RequestInit): Promise<T | null> {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { 'Content-Type': 'application/json', 'x-internal-key': this.config.internalKey },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch (error) {
      this.logger.warn(`call failed: ${url} ${String(error)}`);
      return null;
    }
  }

  async products(ids: string[], currency: 'COP' | 'USD' = 'USD'): Promise<ProductInfo[]> {
    if (!ids.length) return [];
    return (
      (await this.json<ProductInfo[]>(`${this.config.catalogUrl}/products/by-ids`, {
        method: 'POST',
        body: JSON.stringify({ ids, currency }),
      })) ?? []
    );
  }

  async hasPurchased(buyerId: string, productId: string): Promise<boolean> {
    const res = await this.json<{ purchased: boolean }>(
      `${this.config.ordersUrl}/internal/purchases?buyerId=${buyerId}&productId=${productId}`,
    );
    return res?.purchased ?? false;
  }

  async order(orderId: string): Promise<{
    number: number;
    buyerId: string;
    sellers: { sellerOrderId: string; storeId: string; storeName: string }[];
  } | null> {
    return this.json(`${this.config.ordersUrl}/internal/orders/${orderId}`);
  }

  async contacts(
    ids: string[],
  ): Promise<{ id: string; email: string; name: string; locale: string }[]> {
    if (!ids.length) return [];
    return (
      (await this.json(`${this.config.identityUrl}/users/internal/lookup`, {
        method: 'POST',
        body: JSON.stringify({ ids }),
      })) ?? []
    );
  }
}
