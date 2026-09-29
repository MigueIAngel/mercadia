import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, ilike, sql } from 'drizzle-orm';
import type pg from 'pg';
import { EventBus, stageEvent } from '@mercadia/service-kit';
import { AuditService, type RequestMeta } from '../audit/audit.service.js';
import { TokensService } from '../auth/tokens.service.js';
import { DB, POOL, type Database } from '../db/database.module.js';
import { stores, users } from '../db/schema.js';

export const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);

export interface OpenStoreInput {
  name: string;
  description?: string;
  city?: string;
  accentColor?: string;
}

@Injectable()
export class StoresService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(POOL) private readonly pool: pg.Pool,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
    private readonly bus: EventBus,
  ) {}

  /** Any buyer can open a store: they get the seller role and fresh tokens that carry it. */
  async open(userId: string, input: OpenStoreInput, meta: RequestMeta) {
    const [existing] = await this.db.select().from(stores).where(eq(stores.ownerId, userId));
    if (existing) throw new ConflictException('You already have a store');

    let slug = slugify(input.name) || 'store';
    const [taken] = await this.db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.slug, slug));
    if (taken) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO stores (owner_id, name, slug, description, city, accent_color)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          userId,
          input.name.trim(),
          slug,
          input.description ?? '',
          input.city ?? '',
          input.accentColor ?? '#6366f1',
        ],
      );
      await client.query(
        `UPDATE users SET roles = array_append(roles, 'seller'), updated_at = now()
         WHERE id = $1 AND NOT ('seller' = ANY(roles))`,
        [userId],
      );
      await stageEvent(
        client,
        this.bus.build('store.opened', {
          storeId: rows[0].id,
          ownerId: userId,
          name: input.name.trim(),
          slug,
        }),
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await this.audit.record('store_opened', userId, meta, { slug });
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    return this.tokens.issue(user, meta);
  }

  async update(userId: string, patch: Partial<OpenStoreInput> & { logoUrl?: string }) {
    const [store] = await this.db.select().from(stores).where(eq(stores.ownerId, userId));
    if (!store) throw new NotFoundException('You do not have a store');
    const [updated] = await this.db
      .update(stores)
      .set(patch)
      .where(eq(stores.id, store.id))
      .returning();
    await this.bus.publish('store.updated', {
      storeId: updated.id,
      name: updated.name,
      slug: updated.slug,
      logoUrl: updated.logoUrl,
    });
    return updated;
  }

  async mine(userId: string) {
    const [store] = await this.db.select().from(stores).where(eq(stores.ownerId, userId));
    if (!store) throw new NotFoundException('You do not have a store');
    return store;
  }

  list(search?: string) {
    return this.db
      .select({
        id: stores.id,
        name: stores.name,
        slug: stores.slug,
        description: stores.description,
        city: stores.city,
        logoUrl: stores.logoUrl,
        accentColor: stores.accentColor,
        createdAt: stores.createdAt,
      })
      .from(stores)
      .where(
        and(eq(stores.status, 'active'), search ? ilike(stores.name, `%${search}%`) : undefined),
      )
      .orderBy(asc(stores.name));
  }

  async bySlug(slug: string) {
    const [store] = await this.db
      .select({
        id: stores.id,
        name: stores.name,
        slug: stores.slug,
        description: stores.description,
        city: stores.city,
        logoUrl: stores.logoUrl,
        accentColor: stores.accentColor,
        payoutsEnabled: stores.payoutsEnabled,
        createdAt: stores.createdAt,
        ownerName: users.name,
      })
      .from(stores)
      .innerJoin(users, eq(users.id, stores.ownerId))
      .where(and(eq(stores.slug, slug), eq(stores.status, 'active')));
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  async assertOwner(userId: string, storeId: string) {
    const [store] = await this.db
      .select({ id: stores.id })
      .from(stores)
      .where(and(eq(stores.id, storeId), eq(stores.ownerId, userId)));
    if (!store) throw new ForbiddenException();
  }

  async setPayoutsEnabled(storeId: string) {
    await this.db.update(stores).set({ payoutsEnabled: true }).where(eq(stores.id, storeId));
  }

  count() {
    return this.db.select({ n: sql<number>`count(*)::int` }).from(stores);
  }
}
