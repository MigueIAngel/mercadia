import {
  bigserial,
  index,
  integer,
  jsonb,
  numeric,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/** Guest carts use the anonymous id from the web app; account carts are keyed by user. */
export const carts = pgTable(
  'carts',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('carts_user_key').on(t.userId)],
);

export const cartItems = pgTable(
  'cart_items',
  {
    cartId: uuid('cart_id')
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    productId: varchar('product_id', { length: 64 }).notNull(),
    sku: varchar('sku', { length: 80 }).notNull(),
    quantity: integer('quantity').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.cartId, t.sku] })],
);

export const orderNumber = pgSequence('order_number', { startWith: 5000 });

export const ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'completed',
  'cancelled',
  'partially_refunded',
  'refunded',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const SELLER_ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
] as const;
export type SellerOrderStatus = (typeof SELLER_ORDER_STATUSES)[number];

export interface ShippingAddress {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  department: string;
  postalCode?: string;
  country: string;
}

/**
 * One checkout = one order (one payment). It is split into one seller order per store,
 * because each seller ships, gets paid and can be disputed separately.
 */
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: integer('number').notNull().unique(),
    buyerId: uuid('buyer_id').notNull(),
    buyerEmail: varchar('buyer_email', { length: 254 }).notNull(),
    buyerName: varchar('buyer_name', { length: 120 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    /** COP per USD used for this order. */
    fxRate: numeric('fx_rate', { precision: 12, scale: 4 }).notNull(),
    subtotal: integer('subtotal').notNull(),
    shippingTotal: integer('shipping_total').notNull(),
    taxTotal: integer('tax_total').notNull(),
    total: integer('total').notNull(),
    status: varchar('status', { length: 20 })
      .$type<OrderStatus>()
      .notNull()
      .default('pending_payment'),
    shippingAddress: jsonb('shipping_address').$type<ShippingAddress>().notNull(),
    cancelReason: text('cancel_reason'),
    paymentDeadline: timestamp('payment_deadline', { withTimezone: true }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('orders_buyer').on(t.buyerId, t.createdAt), index('orders_status').on(t.status)],
);

export const sellerOrders = pgTable(
  'seller_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id').notNull(),
    storeName: varchar('store_name', { length: 80 }).notNull(),
    status: varchar('status', { length: 20 })
      .$type<SellerOrderStatus>()
      .notNull()
      .default('pending_payment'),
    subtotal: integer('subtotal').notNull(),
    shipping: integer('shipping').notNull(),
    tax: integer('tax').notNull(),
    total: integer('total').notNull(),
    /** Marketplace fee retained from the seller's payout. */
    commission: integer('commission').notNull(),
    refunded: integer('refunded').notNull().default(0),
    trackingNumber: varchar('tracking_number', { length: 40 }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('seller_orders_store').on(t.storeId, t.updatedAt),
    index('seller_orders_order').on(t.orderId),
  ],
);

export const orderLines = pgTable(
  'order_lines',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    sellerOrderId: uuid('seller_order_id')
      .notNull()
      .references(() => sellerOrders.id, { onDelete: 'cascade' }),
    productId: varchar('product_id', { length: 64 }).notNull(),
    sku: varchar('sku', { length: 80 }).notNull(),
    title: varchar('title', { length: 160 }).notNull(),
    image: text('image'),
    options: jsonb('options').$type<Record<string, string>>().notNull().default({}),
    quantity: integer('quantity').notNull(),
    unitPrice: integer('unit_price').notNull(),
    taxRate: numeric('tax_rate', { precision: 5, scale: 4 }).notNull(),
    total: integer('total').notNull(),
  },
  (t) => [index('order_lines_buyer_product').on(t.productId)],
);

export const statusHistory = pgTable('status_history', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  sellerOrderId: uuid('seller_order_id'),
  status: varchar('status', { length: 20 }).notNull(),
  note: text('note'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});

export const outbox = pgTable('outbox', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  eventId: uuid('event_id').notNull().unique(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
});

export type Order = typeof orders.$inferSelect;
export type SellerOrder = typeof sellerOrders.$inferSelect;
export type OrderLine = typeof orderLines.$inferSelect;
