import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export interface Destination {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  department: string;
  postalCode?: string;
  country: string;
}

export const addresses = pgTable(
  'addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    label: varchar('label', { length: 40 }).notNull().default('Casa'),
    fullName: varchar('full_name', { length: 120 }).notNull(),
    phone: varchar('phone', { length: 20 }).notNull(),
    line1: varchar('line1', { length: 160 }).notNull(),
    line2: varchar('line2', { length: 160 }),
    city: varchar('city', { length: 80 }).notNull(),
    department: varchar('department', { length: 80 }).notNull(),
    postalCode: varchar('postal_code', { length: 12 }),
    country: varchar('country', { length: 2 }).notNull().default('CO'),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('addresses_user').on(t.userId)],
);

/** Local read model of seller orders (from orders events) used to authorise actions. */
export const sellerOrders = pgTable('seller_orders', {
  id: uuid('id').primaryKey(),
  orderId: uuid('order_id').notNull(),
  storeId: uuid('store_id').notNull(),
  buyerId: uuid('buyer_id').notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const SHIPMENT_STATUSES = [
  'label_created',
  'in_transit',
  'out_for_delivery',
  'delivered',
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const shipments = pgTable(
  'shipments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerOrderId: uuid('seller_order_id').notNull(),
    orderId: uuid('order_id').notNull(),
    storeId: uuid('store_id').notNull(),
    buyerId: uuid('buyer_id').notNull(),
    carrier: varchar('carrier', { length: 40 }).notNull(),
    service: varchar('service', { length: 12 }).notNull().default('standard'),
    trackingNumber: varchar('tracking_number', { length: 20 }).notNull(),
    status: varchar('status', { length: 20 })
      .$type<ShipmentStatus>()
      .notNull()
      .default('label_created'),
    origin: varchar('origin', { length: 80 }).notNull(),
    destination: jsonb('destination').$type<Destination>().notNull(),
    estimatedDelivery: timestamp('estimated_delivery', { withTimezone: true }).notNull(),
    nextStepAt: timestamp('next_step_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('shipments_seller_order_key').on(t.sellerOrderId),
    uniqueIndex('shipments_tracking_key').on(t.trackingNumber),
    index('shipments_next_step').on(t.nextStepAt),
  ],
);

export const trackingEvents = pgTable('tracking_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  shipmentId: uuid('shipment_id')
    .notNull()
    .references(() => shipments.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull(),
  location: varchar('location', { length: 80 }).notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});

export const DISPUTE_REASONS = [
  'not_received',
  'damaged',
  'not_as_described',
  'wrong_item',
  'return',
] as const;
export const DISPUTE_STATUSES = ['open', 'seller_rejected', 'escalated', 'resolved'] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const disputes = pgTable(
  'disputes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull(),
    sellerOrderId: uuid('seller_order_id').notNull(),
    storeId: uuid('store_id').notNull(),
    buyerId: uuid('buyer_id').notNull(),
    reason: varchar('reason', { length: 20 }).notNull(),
    description: text('description').notNull(),
    requestedAmount: integer('requested_amount').notNull(),
    maxAmount: integer('max_amount').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    status: varchar('status', { length: 20 }).$type<DisputeStatus>().notNull().default('open'),
    resolution: varchar('resolution', { length: 20 }).$type<
      'refund' | 'partial_refund' | 'rejected'
    >(),
    refundAmount: integer('refund_amount'),
    sellerDeadline: timestamp('seller_deadline', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    index('disputes_buyer').on(t.buyerId),
    index('disputes_store').on(t.storeId),
    index('disputes_status').on(t.status),
  ],
);

export const disputeMessages = pgTable('dispute_messages', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  disputeId: uuid('dispute_id')
    .notNull()
    .references(() => disputes.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id'),
  authorRole: varchar('author_role', { length: 10 })
    .$type<'buyer' | 'seller' | 'admin' | 'system'>()
    .notNull(),
  text: text('text').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});

export const outbox = pgTable('outbox', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  eventId: uuid('event_id').notNull().unique(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
});

export type Shipment = typeof shipments.$inferSelect;
export type Dispute = typeof disputes.$inferSelect;
