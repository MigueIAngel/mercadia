import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { EventBus } from '@mercadia/service-kit';
import { Product } from '../products/product.schema.js';
import { StoreView } from './store.schema.js';

/** Keeps the local store read model (and the names copied onto products) in sync. */
@Injectable()
export class StoresProjection implements OnModuleInit {
  constructor(
    @InjectModel(StoreView.name) private readonly stores: Model<StoreView>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    private readonly bus: EventBus,
  ) {}

  onModuleInit() {
    this.bus.on('store.opened', async ({ data }) => {
      await this.stores.updateOne(
        { _id: data.storeId },
        { $set: { name: data.name, slug: data.slug } },
        { upsert: true },
      );
    });
    this.bus.on('store.updated', async ({ data }) => {
      await this.stores.updateOne(
        { _id: data.storeId },
        { $set: { name: data.name, slug: data.slug, logoUrl: data.logoUrl ?? null } },
        { upsert: true },
      );
      await this.products.updateMany(
        { storeId: data.storeId },
        { $set: { storeName: data.name, storeSlug: data.slug } },
      );
    });
  }
}
