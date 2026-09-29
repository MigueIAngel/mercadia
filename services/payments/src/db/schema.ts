import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  boolean,
} from 'drizzle-orm/pg-core';

export const PAYMENT_STATUSES = [
  'requires_payment',
  'succeeded',
  'failed',
  'cancelled',
  'partially_refunded',
  'refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull(),
    buyerId: uuid('buyer_id').notNull(),
    provider: varchar('provider', { length: 10 }).$type<'stripe' | 'mock'>().notNull(),
    /** Stripe PaymentIntent id (or mock reference). */
    providerRef: varchar('provider_ref', { length: 80 }),
    amount: integer('amount').notNull(),
    refunded: integer('refunded').notNull().default(0),
    currency: varchar('currency', { length: 3 }).notNull(),
    status: varchar('status', { length: 20 })
      .$type<PaymentStatus>()
      .notNull()
      .default('requires_payment'),
    failureReason: text('failure_reason'),
    cardBrand: varchar('card_brand', { length: 20 }),
    cardLast4: varchar('card_last4', { length: 4 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('payments_order_key').on(t.orderId), index('payments_ref').on(t.providerRef)],
);

/**
 * Escrow: when the buyer pays, each seller's share (minus commission) is recorded as a pending
 * transfer. It is released only when that seller's shipment is delivered.
 */
export const transfers = pgTable(
  'transfers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id),
    orderId: uuid('order_id').notNull(),
    sellerOrderId: uuid('seller_order_id').notNull(),
    storeId: uuid('store_id').notNull(),
    storeName: varchar('store_name', { length: 80 }).notNull(),
    gross: integer('gross').notNull(),
    commission: integer('commission').notNull(),
    amount: integer('amount').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    status: varchar('status', { length: 12 })
      .$type<'held' | 'released' | 'reversed'>()
      .notNull()
      .default('held'),
    providerRef: varchar('provider_ref', { length: 80 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('transfers_seller_order_key').on(t.sellerOrderId),
    index('transfers_store').on(t.storeId, t.createdAt),
  ],
);

export const refunds = pgTable('refunds', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id')
    .notNull()
    .references(() => payments.id),
  sellerOrderId: uuid('seller_order_id').notNull(),
  amount: integer('amount').notNull(),
  reason: varchar('reason', { length: 60 }).notNull(),
  providerRef: varchar('provider_ref', { length: 80 }),
  /** Dispute or cancellation that caused it (idempotency key). */
  sourceId: varchar('source_id', { length: 80 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const connectedAccounts = pgTable('connected_accounts', {
  storeId: uuid('store_id').primaryKey(),
  provider: varchar('provider', { length: 10 }).notNull(),
  providerAccountId: varchar('provider_account_id', { length: 80 }),
  payoutsEnabled: boolean('payouts_enabled').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** The buyer's customer record at the processor (Stripe Customer), needed to save cards. */
export const paymentCustomers = pgTable('payment_customers', {
  userId: uuid('user_id').primaryKey(),
  provider: varchar('provider', { length: 10 }).notNull(),
  providerCustomerId: varchar('provider_customer_id', { length: 80 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Saved cards. Only the processor's reference and display data are stored: never the number
 * or the CVC (Stripe keeps the card; the simulated processor only validates it).
 */
export const paymentMethods = pgTable(
  'payment_methods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    provider: varchar('provider', { length: 10 }).$type<'stripe' | 'mock'>().notNull(),
    providerRef: varchar('provider_ref', { length: 80 }).notNull(),
    brand: varchar('brand', { length: 20 }).notNull(),
    last4: varchar('last4', { length: 4 }).notNull(),
    expMonth: integer('exp_month').notNull(),
    expYear: integer('exp_year').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payment_methods_user').on(t.userId, t.createdAt),
    uniqueIndex('payment_methods_ref_key').on(t.providerRef),
  ],
);

/** Stripe webhook ids already handled (Stripe retries deliveries). */
export const webhookEvents = pgTable('webhook_events', {
  id: varchar('id', { length: 80 }).primaryKey(),
  type: varchar('type', { length: 60 }).notNull(),
  payload: jsonb('payload'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});

export const outbox = pgTable('outbox', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  eventId: uuid('event_id').notNull().unique(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
});

export type Payment = typeof payments.$inferSelect;
export type Transfer = typeof transfers.$inferSelect;
export type PaymentMethod = typeof paymentMethods.$inferSelect;
