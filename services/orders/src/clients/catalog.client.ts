import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { CONFIG, type OrdersConfig } from '../config.js';

export interface QuoteLine {
  productId: string;
  sku: string;
  quantity: number;
  available: boolean;
  reason: 'not_found' | 'insufficient_stock' | null;
  stock?: number;
  title?: string;
  image?: string | null;
  options?: Record<string, string>;
  storeId?: string;
  storeName?: string;
  category?: string;
  unitPriceUsd?: number;
  weightGrams?: number;
}

/** Synchronous calls to the catalog: authoritative prices, stock and exchange rate. */
@Injectable()
export class CatalogClient {
  constructor(@Inject(CONFIG) private readonly config: OrdersConfig) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.config.catalogUrl}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', 'x-internal-key': this.config.internalKey },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new ServiceUnavailableException('Catalog service is unavailable');
    }
    if (!response.ok)
      throw new ServiceUnavailableException(
        `Catalog responded ${response.status}: ${await response.text()}`,
      );
    return (await response.json()) as T;
  }

  quote(items: { productId: string; sku: string; quantity: number }[]): Promise<QuoteLine[]> {
    if (items.length === 0) return Promise.resolve([]);
    const body = {
      items: items.map(({ productId, sku, quantity }) => ({ productId, sku, quantity })),
    };
    return this.request('/internal/quote', { method: 'POST', body: JSON.stringify(body) });
  }

  async usdToCop(): Promise<number> {
    const body = await this.request<{ rates: { COP: number } }>('/currency/rates');
    return body.rates.COP;
  }
}
