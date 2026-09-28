import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Currency } from '@mercadia/contracts';
import { CatalogClient } from '../clients/catalog.client.js';
import { priceLines } from '../checkout/pricing.js';
import { DB, type Database } from '../db/database.module.js';
import { cartItems, carts } from '../db/schema.js';

export interface CartOwner {
  userId?: string;
  guestCartId?: string;
}

const MAX_QUANTITY = 20;

@Injectable()
export class CartService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly catalog: CatalogClient,
  ) {}

  /**
   * Resolves the cart for this request. When a guest signs in, the items of the anonymous
   * cart are merged into the account cart and the guest cart is removed.
   */
  async resolve({ userId, guestCartId }: CartOwner): Promise<string> {
    if (!userId) {
      if (!guestCartId) throw new BadRequestException('Missing cart id');
      await this.db.insert(carts).values({ id: guestCartId }).onConflictDoNothing();
      return guestCartId;
    }
    let [cart] = await this.db.select().from(carts).where(eq(carts.userId, userId));
    if (!cart) {
      [cart] = await this.db
        .insert(carts)
        .values({ id: randomUUID(), userId })
        .onConflictDoNothing()
        .returning();
      cart ??= (await this.db.select().from(carts).where(eq(carts.userId, userId)))[0];
    }
    if (guestCartId && guestCartId !== cart.id) await this.merge(guestCartId, cart.id);
    return cart.id;
  }

  private async merge(fromCartId: string, toCartId: string) {
    const [guest] = await this.db.select().from(carts).where(eq(carts.id, fromCartId));
    if (!guest || guest.userId) return;
    await this.db.transaction(async (tx) => {
      const items = await tx.select().from(cartItems).where(eq(cartItems.cartId, fromCartId));
      for (const item of items) {
        await tx
          .insert(cartItems)
          .values({ ...item, cartId: toCartId })
          .onConflictDoUpdate({
            target: [cartItems.cartId, cartItems.sku],
            set: {
              quantity: sql`LEAST(${cartItems.quantity} + ${item.quantity}, ${MAX_QUANTITY})`,
            },
          });
      }
      await tx.delete(carts).where(eq(carts.id, fromCartId));
    });
  }

  async items(cartId: string) {
    return this.db
      .select()
      .from(cartItems)
      .where(eq(cartItems.cartId, cartId))
      .orderBy(cartItems.addedAt);
  }

  async view(cartId: string, currency: Currency) {
    const items = await this.items(cartId);
    if (items.length === 0)
      return { currency, stores: [], unavailable: [], subtotal: 0, tax: 0, count: 0 };
    const [quote, rate] = await Promise.all([this.catalog.quote(items), this.catalog.usdToCop()]);
    return { currency, ...priceLines(quote, currency, rate) };
  }

  async add(cartId: string, productId: string, sku: string, quantity: number) {
    const [existing] = await this.db
      .select()
      .from(cartItems)
      .where(and(eq(cartItems.cartId, cartId), eq(cartItems.sku, sku)));
    const wanted = Math.min(MAX_QUANTITY, (existing?.quantity ?? 0) + quantity);
    const [line] = await this.catalog.quote([{ productId, sku, quantity: wanted }]);
    if (!line?.title) throw new BadRequestException('Product not available');
    if (!line.available) throw new BadRequestException(`Only ${line.stock ?? 0} units available`);
    await this.db
      .insert(cartItems)
      .values({ cartId, productId, sku, quantity: wanted })
      .onConflictDoUpdate({ target: [cartItems.cartId, cartItems.sku], set: { quantity: wanted } });
    await this.touch(cartId);
  }

  async setQuantity(cartId: string, sku: string, quantity: number) {
    if (quantity <= 0) return this.remove(cartId, sku);
    const [item] = await this.db
      .select()
      .from(cartItems)
      .where(and(eq(cartItems.cartId, cartId), eq(cartItems.sku, sku)));
    if (!item) throw new BadRequestException('Item not in cart');
    const [line] = await this.catalog.quote([{ productId: item.productId, sku, quantity }]);
    if (!line?.available) throw new BadRequestException(`Only ${line?.stock ?? 0} units available`);
    await this.db
      .update(cartItems)
      .set({ quantity: Math.min(quantity, MAX_QUANTITY) })
      .where(and(eq(cartItems.cartId, cartId), eq(cartItems.sku, sku)));
    await this.touch(cartId);
  }

  async remove(cartId: string, sku: string) {
    await this.db
      .delete(cartItems)
      .where(and(eq(cartItems.cartId, cartId), eq(cartItems.sku, sku)));
    await this.touch(cartId);
  }

  async clear(cartId: string) {
    await this.db.delete(cartItems).where(eq(cartItems.cartId, cartId));
  }

  async count(cartId: string) {
    const [row] = await this.db
      .select({ n: sql<number>`coalesce(sum(${cartItems.quantity}), 0)::int` })
      .from(cartItems)
      .where(eq(cartItems.cartId, cartId));
    return row.n;
  }

  private touch(cartId: string) {
    return this.db.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId));
  }
}
