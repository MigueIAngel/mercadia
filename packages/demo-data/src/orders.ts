import { demoId } from './ids.js';
import { BUYERS } from './people.js';
import { demoProducts, type DemoProduct } from './products.js';

export type DemoOrderStatus = 'delivered' | 'shipped' | 'paid';

export interface DemoOrderLine {
  productId: string;
  sku: string;
  title: string;
  image: string | null;
  options: Record<string, string>;
  category: string;
  storeId: string;
  quantity: number;
  unitPriceUsd: number;
}

export interface DemoOrder {
  id: string;
  number: number;
  buyerId: string;
  buyerEmail: string;
  buyerName: string;
  createdAt: string;
  status: DemoOrderStatus;
  lines: DemoOrderLine[];
}

/** Mulberry32: tiny deterministic PRNG so every service generates the same history. */
function prng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;

/**
 * 80 past orders over the last 90 days (relative to a fixed date) from the demo buyers, so
 * dashboards, sales charts, reviews ("verified purchase") and payouts have history.
 */
export function demoOrders(count = 80, now = Date.UTC(2026, 8, 20)): DemoOrder[] {
  const random = prng(2026);
  const products = demoProducts().filter((p) => p.priceUsd < 200_000);
  const pick = <T>(list: T[]) => list[Math.floor(random() * list.length)];
  return Array.from({ length: count }, (_, i): DemoOrder => {
    const buyer = BUYERS[i % BUYERS.length];
    // The last few orders are recent, so every status appears in the demo.
    const ageDays = i >= count - 4 ? count - 1 - i : Math.floor(random() * 90);
    const lineCount = 1 + Math.floor(random() * 3);
    const chosen = new Map<string, DemoProduct>();
    while (chosen.size < lineCount) {
      const p = pick(products);
      chosen.set(p.id, p);
    }
    return {
      id: demoId('order', i),
      number: 1000 + i,
      buyerId: buyer.id,
      buyerEmail: buyer.email,
      buyerName: buyer.name,
      createdAt: new Date(now - ageDays * DAY - Math.floor(random() * DAY)).toISOString(),
      status: (ageDays > 10 ? 'delivered' : ageDays > 3 ? 'shipped' : 'paid') as DemoOrderStatus,
      lines: [...chosen.values()].map((p) => {
        const variant = pick(p.variants);
        return {
          productId: p.id,
          sku: variant.sku,
          title: p.title,
          image: p.images[0] ?? null,
          options: variant.options,
          category: p.category,
          storeId: p.storeId,
          quantity: 1 + Math.floor(random() * 2),
          unitPriceUsd: p.priceUsd,
        };
      }),
    };
  }).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
