import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import type pg from 'pg';
import { priceFromUsd, type Currency } from '@mercadia/contracts';
import { EventBus, type AuthUser } from '@mercadia/service-kit';
import { CartService } from '../cart/cart.service.js';
import { CatalogClient } from '../clients/catalog.client.js';
import { FulfillmentClient } from '../clients/fulfillment.client.js';
import { CONFIG, type OrdersConfig } from '../config.js';
import { POOL } from '../db/database.module.js';
import { stage } from '../orders/order-events.js';
import { OrdersService } from '../orders/orders.service.js';
import type { AddressDto } from './checkout.dto.js';
import { priceLines } from './pricing.js';

@Injectable()
export class CheckoutService {
  constructor(
    @Inject(POOL) private readonly pool: pg.Pool,
    @Inject(CONFIG) private readonly config: OrdersConfig,
    private readonly carts: CartService,
    private readonly catalog: CatalogClient,
    private readonly fulfillment: FulfillmentClient,
    private readonly orders: OrdersService,
    private readonly bus: EventBus,
  ) {}

  /** Cart priced in the chosen currency plus shipping per store for an address. */
  async quote(
    user: AuthUser,
    currency: Currency,
    address: { city: string; department: string },
    guestCartId?: string,
  ) {
    const cartId = await this.carts.resolve({ userId: user.sub, guestCartId });
    const items = await this.carts.items(cartId);
    if (items.length === 0) throw new BadRequestException('Your cart is empty');
    const [quote, rate] = await Promise.all([this.catalog.quote(items), this.catalog.usdToCop()]);
    const priced = priceLines(quote, currency, rate);
    const rates = await this.fulfillment.rates(
      address,
      priced.stores.map((s) => ({
        storeId: s.storeId,
        weightGrams: s.weightGrams,
        subtotalUsd: s.subtotalUsd,
      })),
    );
    const stores = priced.stores.map((s) => {
      const r = rates.find((x) => x.storeId === s.storeId);
      const shipping = priceFromUsd(r?.costUsd ?? 400, currency, rate);
      return {
        ...s,
        shipping,
        etaDays: r?.etaDays ?? 5,
        carrier: r?.carrier ?? 'Estándar',
        total: s.subtotal + shipping,
      };
    });
    const shippingTotal = stores.reduce((n, s) => n + s.shipping, 0);
    return {
      cartId,
      currency,
      rate,
      stores,
      unavailable: priced.unavailable,
      subtotal: priced.subtotal,
      tax: priced.tax,
      shippingTotal,
      total: priced.subtotal + shippingTotal,
    };
  }

  /**
   * Places the order: one transaction writes the order, one seller order per store, the lines,
   * the history and the `order.placed` event (outbox). Stock is reserved asynchronously by
   * the catalog; payment starts right after.
   */
  async place(user: AuthUser, currency: Currency, address: AddressDto, guestCartId?: string) {
    const quote = await this.quote(user, currency, address, guestCartId);
    if (quote.unavailable.length > 0) {
      throw new ConflictException({
        message: 'Some items are no longer available',
        unavailable: quote.unavailable,
      });
    }
    const client = await this.pool.connect();
    let orderId: string;
    try {
      await client.query('BEGIN');
      const deadline = new Date(Date.now() + this.config.paymentWindowMinutes * 60_000);
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO orders (number, buyer_id, buyer_email, buyer_name, currency, fx_rate, subtotal,
           shipping_total, tax_total, total, shipping_address, payment_deadline)
         VALUES (nextval('order_number'), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [
          user.sub,
          user.email,
          user.name,
          currency,
          quote.rate,
          quote.subtotal,
          quote.shippingTotal,
          quote.tax,
          quote.total,
          JSON.stringify(address),
          deadline,
        ],
      );
      orderId = rows[0].id;
      const eventLines = [];
      for (const store of quote.stores) {
        const commission = Math.round(store.subtotal * this.config.commissionRate);
        const { rows: so } = await client.query<{ id: string }>(
          `INSERT INTO seller_orders (order_id, store_id, store_name, subtotal, shipping, tax, total, commission)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [
            orderId,
            store.storeId,
            store.storeName,
            store.subtotal,
            store.shipping,
            store.tax,
            store.total,
            commission,
          ],
        );
        for (const line of store.lines) {
          await client.query(
            `INSERT INTO order_lines (order_id, seller_order_id, product_id, sku, title, image, options, quantity, unit_price, tax_rate, total)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              orderId,
              so[0].id,
              line.productId,
              line.sku,
              line.title,
              line.image,
              JSON.stringify(line.options),
              line.quantity,
              line.unitPrice,
              line.taxRate,
              line.total,
            ],
          );
          eventLines.push({
            sellerOrderId: so[0].id,
            storeId: store.storeId,
            productId: line.productId,
            variantSku: line.sku,
            title: line.title,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
          });
        }
      }
      await client.query(
        `INSERT INTO status_history (order_id, status, note) VALUES ($1, 'pending_payment', 'Order placed')`,
        [orderId],
      );
      await stage(
        this.bus,
        client,
        'order.placed',
        {
          orderId,
          buyerId: user.sub,
          buyerEmail: user.email,
          currency,
          total: quote.total,
          lines: eventLines,
        },
        orderId,
      );
      await client.query('DELETE FROM cart_items WHERE cart_id = $1', [quote.cartId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.orders.detail(orderId!, user);
  }
}
