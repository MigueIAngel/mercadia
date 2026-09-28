import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 254 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    passwordHash: text('password_hash'),
    googleSub: varchar('google_sub', { length: 64 }),
    avatarUrl: text('avatar_url'),
    locale: varchar('locale', { length: 2 }).notNull().default('es'),
    currency: varchar('currency', { length: 3 }).notNull().default('COP'),
    roles: text('roles')
      .array()
      .notNull()
      .default(sql`ARRAY['buyer']::text[]`),
    status: varchar('status', { length: 12 }).notNull().default('active'),
    /** AES-256-GCM encrypted TOTP secret. */
    totpSecret: text('totp_secret'),
    totpEnabled: boolean('totp_enabled').notNull().default(false),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_email_key').on(sql`lower(${t.email})`),
    uniqueIndex('users_google_sub_key').on(t.googleSub),
  ],
);

export const recoveryCodes = pgTable('recovery_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  codeHash: varchar('code_hash', { length: 64 }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
});

/**
 * Refresh tokens rotate on every use. All tokens descending from one login share a
 * `familyId`; presenting an already-rotated token revokes the whole family (reuse detection).
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    userAgent: text('user_agent'),
    ip: varchar('ip', { length: 64 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('refresh_tokens_hash_key').on(t.tokenHash),
    index('refresh_tokens_family').on(t.familyId),
  ],
);

export const stores = pgTable(
  'stores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    name: varchar('name', { length: 80 }).notNull(),
    slug: varchar('slug', { length: 90 }).notNull(),
    description: text('description').notNull().default(''),
    city: varchar('city', { length: 80 }).notNull().default(''),
    logoUrl: text('logo_url'),
    accentColor: varchar('accent_color', { length: 9 }).notNull().default('#6366f1'),
    status: varchar('status', { length: 12 }).notNull().default('active'),
    payoutsEnabled: boolean('payouts_enabled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('stores_slug_key').on(t.slug), uniqueIndex('stores_owner_key').on(t.ownerId)],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id'),
    actorId: uuid('actor_id'),
    action: varchar('action', { length: 60 }).notNull(),
    ip: varchar('ip', { length: 64 }),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_user').on(t.userId, t.createdAt)],
);

/** Transactional outbox, relayed to the event bus by `OutboxRelay`. */
export const outbox = pgTable('outbox', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  eventId: uuid('event_id').notNull().unique(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
});

export type User = typeof users.$inferSelect;
export type Store = typeof stores.$inferSelect;
