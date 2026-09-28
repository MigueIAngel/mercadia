import { ivaRate, priceFromUsd, splitTax, type Currency } from '@mercadia/contracts';
import type { QuoteLine } from '../clients/catalog.client.js';

export interface PricedLine {
  productId: string;
  sku: string;
  title: string;
  image: string | null;
  options: Record<string, string>;
  category: string;
  quantity: number;
  unitPrice: number;
  unitPriceUsd: number;
  taxRate: number;
  total: number;
  weightGrams: number;
  available: boolean;
  stock: number;
}

export interface StoreGroup {
  storeId: string;
  storeName: string;
  lines: PricedLine[];
  subtotal: number;
  subtotalUsd: number;
  tax: number;
  weightGrams: number;
}

/**
 * Prices every line in the buyer's currency (IVA included) and groups them by store,
 * since each store becomes its own seller order.
 */
export function priceLines(quote: QuoteLine[], currency: Currency, usdToCop: number) {
  const groups = new Map<string, StoreGroup>();
  const unavailable: { productId: string; sku: string; reason: string }[] = [];
  for (const q of quote) {
    if (!q.title || q.unitPriceUsd === undefined) {
      unavailable.push({ productId: q.productId, sku: q.sku, reason: q.reason ?? 'not_found' });
      continue;
    }
    const unitPrice = priceFromUsd(q.unitPriceUsd, currency, usdToCop);
    const taxRate = ivaRate(q.category!);
    const total = unitPrice * q.quantity;
    const line: PricedLine = {
      productId: q.productId,
      sku: q.sku,
      title: q.title,
      image: q.image ?? null,
      options: q.options ?? {},
      category: q.category!,
      quantity: q.quantity,
      unitPrice,
      unitPriceUsd: q.unitPriceUsd,
      taxRate,
      total,
      weightGrams: (q.weightGrams ?? 500) * q.quantity,
      available: q.available,
      stock: q.stock ?? 0,
    };
    if (!q.available)
      unavailable.push({
        productId: q.productId,
        sku: q.sku,
        reason: q.reason ?? 'insufficient_stock',
      });
    const group = groups.get(q.storeId!) ?? {
      storeId: q.storeId!,
      storeName: q.storeName!,
      lines: [],
      subtotal: 0,
      subtotalUsd: 0,
      tax: 0,
      weightGrams: 0,
    };
    group.lines.push(line);
    group.subtotal += total;
    group.subtotalUsd += q.unitPriceUsd * q.quantity;
    group.tax += splitTax(total, taxRate).tax;
    group.weightGrams += line.weightGrams;
    groups.set(q.storeId!, group);
  }
  const stores = [...groups.values()];
  return {
    stores,
    unavailable,
    subtotal: stores.reduce((n, g) => n + g.subtotal, 0),
    tax: stores.reduce((n, g) => n + g.tax, 0),
    count: stores.reduce((n, g) => n + g.lines.reduce((m, l) => m + l.quantity, 0), 0),
  };
}
