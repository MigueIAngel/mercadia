import { describe, expect, it } from 'vitest';
import { CATEGORIES, demoId, demoProducts, demoReviews, STORES, USERS } from './index.js';

describe('demo data', () => {
  const products = demoProducts();

  it('produces stable RFC 4122 v5 ids', () => {
    expect(demoId('user', 'admin')).toBe(demoId('user', 'admin'));
    expect(demoId('user', 'admin')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('assigns every product to a store and a top-level category', () => {
    expect(products).toHaveLength(194);
    const storeIds = new Set(STORES.map((s) => s.id));
    const categories = new Set(CATEGORIES.map((c) => c.slug));
    for (const p of products) {
      expect(storeIds.has(p.storeId)).toBe(true);
      expect(categories.has(p.category)).toBe(true);
      expect(p.variants.length).toBeGreaterThan(0);
      expect(p.priceUsd).toBeGreaterThan(0);
    }
  });

  it('gives apparel and shoes size variants whose stock adds up', () => {
    const shirt = products.find((p) => p.subcategory === 'mens-shirts')!;
    expect(shirt.options).toEqual([{ name: 'size', values: ['S', 'M', 'L', 'XL'] }]);
    const shoes = products.find((p) => p.subcategory === 'mens-shoes')!;
    expect(shoes.variants).toHaveLength(6);
  });

  it('marks sale prices below the compare-at price', () => {
    const sale = products.filter((p) => p.compareAtUsd);
    expect(sale.length).toBeGreaterThan(20);
    expect(sale.every((p) => p.priceUsd < p.compareAtUsd!)).toBe(true);
  });

  it('has unique slugs, users and reviews', () => {
    expect(new Set(products.map((p) => p.slug)).size).toBe(products.length);
    expect(new Set(USERS.map((u) => u.email)).size).toBe(USERS.length);
    expect(demoReviews().length).toBe(582);
  });
});
