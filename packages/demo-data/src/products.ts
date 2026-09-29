import { readFileSync } from 'node:fs';
import { parentCategory } from './categories.js';
import { demoId } from './ids.js';
import { storeForSource } from './people.js';

interface RawReview {
  rating: number;
  comment: string;
  date: string;
  reviewerName: string;
  reviewerEmail: string;
}

interface RawProduct {
  id: number;
  title: string;
  description: string;
  category: string;
  price: number;
  discountPercentage: number;
  rating: number;
  stock: number;
  tags: string[];
  brand?: string;
  sku: string;
  weight: number;
  dimensions: { width: number; height: number; depth: number };
  warrantyInformation: string;
  shippingInformation: string;
  returnPolicy: string;
  reviews: RawReview[];
  images: string[];
  thumbnail: string;
}

export interface DemoVariant {
  sku: string;
  options: Record<string, string>;
  stock: number;
}

export interface DemoProduct {
  id: string;
  sourceId: number;
  storeId: string;
  slug: string;
  title: string;
  description: string;
  brand: string | null;
  category: string;
  subcategory: string;
  tags: string[];
  images: string[];
  /** Selling price in USD cents, tax included. */
  priceUsd: number;
  /** Previous price when the product is on sale. */
  compareAtUsd: number | null;
  options: { name: string; values: string[] }[];
  variants: DemoVariant[];
  weightGrams: number;
  dimensionsCm: { width: number; height: number; depth: number };
  warranty: string;
  shipping: string;
  returnPolicy: string;
  createdAt: string;
}

export interface DemoReview {
  id: string;
  productId: string;
  storeId: string;
  rating: number;
  comment: string;
  authorName: string;
  createdAt: string;
}

const APPAREL = ['mens-shirts', 'tops', 'womens-dresses'];
const SHOES = ['mens-shoes', 'womens-shoes'];

let cache: RawProduct[] | undefined;
function raw(): RawProduct[] {
  cache ??= (
    JSON.parse(
      readFileSync(new URL('../data/dummyjson-products.json', import.meta.url), 'utf8'),
    ) as { products: RawProduct[] }
  ).products;
  return cache;
}

const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/** Spreads creation dates over the last year, newest products first in the dataset order. */
const createdAt = (index: number) =>
  new Date(Date.UTC(2025, 9, 1) + index * 1.8 * 24 * 3600 * 1000).toISOString();

function variantsFor(p: RawProduct): Pick<DemoProduct, 'options' | 'variants'> {
  const split = (values: string[]) => {
    const base = Math.floor(p.stock / values.length);
    return values.map((value, i) => ({
      sku: `${p.sku}-${value}`.toUpperCase(),
      options: { size: value },
      stock: i === 0 ? p.stock - base * (values.length - 1) : base,
    }));
  };
  if (APPAREL.includes(p.category)) {
    const sizes = ['S', 'M', 'L', 'XL'];
    return { options: [{ name: 'size', values: sizes }], variants: split(sizes) };
  }
  if (SHOES.includes(p.category)) {
    const sizes = ['37', '38', '39', '40', '41', '42'];
    return { options: [{ name: 'size', values: sizes }], variants: split(sizes) };
  }
  return { options: [], variants: [{ sku: p.sku.toUpperCase(), options: {}, stock: p.stock }] };
}

export function demoProducts(): DemoProduct[] {
  return raw().map((p, index) => {
    const onSale = p.discountPercentage >= 5 && p.id % 2 === 0;
    const list = Math.round(p.price * 100);
    const price = onSale ? Math.round(list * (1 - p.discountPercentage / 100)) : list;
    return {
      id: demoId('product', p.id),
      sourceId: p.id,
      storeId: storeForSource(p.category).id,
      slug: `${slugify(p.title)}-${p.id}`,
      title: p.title,
      description: p.description,
      brand: p.brand ?? null,
      category: parentCategory(p.category).slug,
      subcategory: p.category,
      tags: p.tags,
      images: p.images,
      priceUsd: price,
      compareAtUsd: onSale ? list : null,
      ...variantsFor(p),
      weightGrams: Math.max(50, Math.round(p.weight * 100)),
      dimensionsCm: p.dimensions,
      warranty: p.warrantyInformation,
      shipping: p.shippingInformation,
      returnPolicy: p.returnPolicy,
      createdAt: createdAt(index),
    };
  });
}

export function demoReviews(): DemoReview[] {
  return raw().flatMap((p) =>
    p.reviews.map((r, i) => ({
      id: demoId('review', `${p.id}-${i}`),
      productId: demoId('product', p.id),
      storeId: storeForSource(p.category).id,
      rating: r.rating,
      comment: r.comment,
      authorName: r.reviewerName,
      createdAt: r.date,
    })),
  );
}
