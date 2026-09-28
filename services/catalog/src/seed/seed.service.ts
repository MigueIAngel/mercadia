import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { demoProducts, demoReviews, STORES } from '@mercadia/demo-data';
import { CONFIG, type CatalogConfig } from '../config.js';
import { Product } from '../products/product.schema.js';
import { StoreView } from '../stores/store.schema.js';

/** Fills an empty catalog with the 194 demo products (see packages/demo-data). */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectModel(StoreView.name) private readonly stores: Model<StoreView>,
    @Inject(CONFIG) private readonly config: CatalogConfig,
  ) {}

  async onApplicationBootstrap() {
    if (this.config.seed) await this.seed();
  }

  async seed() {
    if ((await this.stores.estimatedDocumentCount()) === 0) {
      await this.stores.insertMany(
        STORES.map((s) => ({
          _id: s.id,
          name: s.name,
          slug: s.slug,
          city: s.city,
          accentColor: s.accent,
        })),
      );
    }
    if ((await this.products.estimatedDocumentCount()) > 0) return;

    const ratings = new Map<string, { sum: number; count: number }>();
    for (const r of demoReviews()) {
      const current = ratings.get(r.productId) ?? { sum: 0, count: 0 };
      ratings.set(r.productId, { sum: current.sum + r.rating, count: current.count + 1 });
    }
    const storeById = new Map(STORES.map((s) => [s.id, s]));
    const docs = demoProducts().map((p) => {
      const rating = ratings.get(p.id);
      const store = storeById.get(p.storeId)!;
      return {
        _id: p.id,
        storeId: p.storeId,
        storeName: store.name,
        storeSlug: store.slug,
        slug: p.slug,
        title: p.title,
        description: p.description,
        brand: p.brand,
        category: p.category,
        subcategory: p.subcategory,
        tags: p.tags,
        images: p.images,
        priceUsd: p.priceUsd,
        compareAtUsd: p.compareAtUsd,
        options: p.options,
        variants: p.variants,
        totalStock: p.variants.reduce((n, v) => n + v.stock, 0),
        specs: {
          weightGrams: p.weightGrams,
          dimensionsCm: p.dimensionsCm,
          warranty: p.warranty,
          shipping: p.shipping,
          returnPolicy: p.returnPolicy,
        },
        status: 'active',
        ratingAvg: rating ? Math.round((rating.sum / rating.count) * 100) / 100 : 0,
        ratingCount: rating?.count ?? 0,
        // Deterministic popularity so "best sellers" looks realistic.
        salesCount: (p.sourceId * 37) % 180,
        createdAt: new Date(p.createdAt),
      };
    });
    await this.products.insertMany(docs, { ordered: false });
    this.logger.log(`demo catalog loaded: ${docs.length} products`);
  }
}
