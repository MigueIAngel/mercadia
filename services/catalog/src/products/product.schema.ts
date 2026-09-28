import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import type { HydratedDocument } from 'mongoose';

export const PRODUCT_STATUSES = ['draft', 'active', 'archived', 'blocked'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

@Schema({ _id: false })
export class Variant {
  @Prop({ required: true })
  sku: string;

  /** e.g. { size: 'M' }; empty for products without options. */
  @Prop({ type: Object, default: {} })
  options: Record<string, string>;

  @Prop({ required: true, min: 0 })
  stock: number;
}

@Schema({ _id: false })
export class ProductOption {
  @Prop({ required: true })
  name: string;

  @Prop({ type: [String], default: [] })
  values: string[];
}

@Schema({ _id: false })
export class Specs {
  @Prop({ default: 500 })
  weightGrams: number;

  @Prop({ type: Object })
  dimensionsCm?: { width: number; height: number; depth: number };

  @Prop()
  warranty?: string;

  @Prop()
  shipping?: string;

  @Prop()
  returnPolicy?: string;
}

/**
 * Prices are stored once, in USD cents (tax included), and converted to the shopper's
 * currency at read time with the current rate.
 */
@Schema({ collection: 'products', timestamps: true })
export class Product {
  @Prop({ type: String, default: () => randomUUID() })
  _id: string;

  @Prop({ required: true, index: true })
  storeId: string;

  @Prop({ required: true })
  storeName: string;

  @Prop({ required: true })
  storeSlug: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop({ required: true })
  title: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: String, default: null, index: true })
  brand: string | null;

  @Prop({ required: true, index: true })
  category: string;

  @Prop({ index: true })
  subcategory?: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ required: true, min: 1 })
  priceUsd: number;

  @Prop({ type: Number, default: null })
  compareAtUsd: number | null;

  @Prop({ type: [ProductOption], default: [] })
  options: ProductOption[];

  @Prop({ type: [Variant], default: [] })
  variants: Variant[];

  /** Sum of variant stock, kept in sync for fast "in stock" filters. */
  @Prop({ default: 0, index: true })
  totalStock: number;

  @Prop({ type: Specs, default: {} })
  specs: Specs;

  @Prop({ type: String, enum: PRODUCT_STATUSES, default: 'draft', index: true })
  status: ProductStatus;

  @Prop({ default: 0 })
  ratingAvg: number;

  @Prop({ default: 0 })
  ratingCount: number;

  @Prop({ default: 0 })
  salesCount: number;

  createdAt: Date;
  updatedAt: Date;
}

export type ProductDocument = HydratedDocument<Product>;
export const ProductSchema = SchemaFactory.createForClass(Product);
ProductSchema.index({ 'variants.sku': 1 }, { unique: true });
ProductSchema.index({ status: 1, category: 1, priceUsd: 1 });
ProductSchema.index({ status: 1, createdAt: -1 });
// Fallback full-text index when Atlas Search is not available.
ProductSchema.index(
  { title: 'text', brand: 'text', tags: 'text', description: 'text' },
  { weights: { title: 8, brand: 5, tags: 3, description: 1 }, name: 'products_text' },
);
