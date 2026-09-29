import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { Connection, Model } from 'mongoose';
import type { EventEnvelope } from '@mercadia/contracts';
import { EventBus } from '@mercadia/service-kit';
import { CONFIG, type CatalogConfig } from '../config.js';
import { Product } from '../products/product.schema.js';
import { Reservation } from './reservation.schema.js';

class OutOfStockError extends Error {
  constructor(readonly sku: string) {
    super(`out of stock: ${sku}`);
  }
}

/**
 * Stock is reserved atomically for the whole order inside a MongoDB transaction: every
 * variant is decremented only if it still has enough units, otherwise nothing changes.
 */
@Injectable()
export class StockService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StockService.name);
  private sweeper?: NodeJS.Timeout;

  constructor(
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectModel(Reservation.name) private readonly reservations: Model<Reservation>,
    @InjectConnection() private readonly connection: Connection,
    @Inject(CONFIG) private readonly config: CatalogConfig,
    private readonly bus: EventBus,
  ) {}

  onModuleInit() {
    this.bus.on('order.placed', (e) => this.onOrderPlaced(e));
    this.bus.on('order.cancelled', (e) => this.release(e.data.orderId, e.correlationId));
    this.bus.on('order.paid', (e) => this.commit(e.data.orderId));
    this.sweeper = setInterval(() => void this.releaseExpired(), 60_000);
  }

  onModuleDestroy() {
    clearInterval(this.sweeper);
  }

  async onOrderPlaced(event: EventEnvelope<'order.placed'>) {
    const { orderId, lines } = event.data;
    if (await this.reservations.exists({ _id: orderId })) return;
    const wanted = new Map<string, { productId: string; sku: string; quantity: number }>();
    for (const line of lines) {
      const current = wanted.get(line.variantSku);
      wanted.set(line.variantSku, {
        productId: line.productId,
        sku: line.variantSku,
        quantity: (current?.quantity ?? 0) + line.quantity,
      });
    }

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        for (const line of wanted.values()) {
          const result = await this.products.updateOne(
            {
              _id: line.productId,
              status: 'active',
              variants: { $elemMatch: { sku: line.sku, stock: { $gte: line.quantity } } },
            },
            { $inc: { 'variants.$.stock': -line.quantity, totalStock: -line.quantity } },
            { session },
          );
          if (result.modifiedCount === 0) throw new OutOfStockError(line.sku);
        }
        await this.reservations.create(
          [
            {
              _id: orderId,
              lines: [...wanted.values()],
              expiresAt: new Date(Date.now() + this.config.reservationMinutes * 60_000),
            },
          ],
          { session },
        );
      });
    } catch (error) {
      if (error instanceof OutOfStockError) {
        await this.bus.publish(
          'stock.rejected',
          { orderId, reason: 'out_of_stock', sku: error.sku },
          orderId,
        );
        return;
      }
      throw error;
    } finally {
      await session.endSession();
    }
    await this.bus.publish('stock.reserved', { orderId }, orderId);
  }

  /** Gives reserved units back (cancelled, failed or expired checkout). */
  async release(orderId: string, correlationId = orderId): Promise<boolean> {
    const reservation = await this.reservations.findOneAndUpdate(
      { _id: orderId, status: 'reserved' },
      { status: 'released' },
    );
    if (!reservation) return false;
    for (const line of reservation.lines) {
      await this.products.updateOne(
        { _id: line.productId, 'variants.sku': line.sku },
        { $inc: { 'variants.$.stock': line.quantity, totalStock: line.quantity } },
      );
    }
    await this.bus.publish('stock.released', { orderId }, correlationId);
    return true;
  }

  async commit(orderId: string) {
    const reservation = await this.reservations.findOneAndUpdate(
      { _id: orderId, status: 'reserved' },
      { status: 'committed' },
    );
    if (!reservation) return;
    for (const line of reservation.lines) {
      await this.products.updateOne(
        { _id: line.productId },
        { $inc: { salesCount: line.quantity } },
      );
    }
  }

  async releaseExpired() {
    try {
      const expired = await this.reservations
        .find({ status: 'reserved', expiresAt: { $lt: new Date() } }, { _id: 1 })
        .limit(50);
      for (const r of expired) {
        if (await this.release(r._id)) this.logger.log(`released expired reservation ${r._id}`);
      }
    } catch (error) {
      this.logger.error(`expiry sweep failed: ${String(error)}`);
    }
  }
}
