import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, PipelineStage, QueryFilter } from 'mongoose';
import { randomBytes } from 'node:crypto';
import { ivaRate, type Currency } from '@mercadia/contracts';
import { CATEGORIES, SUBCATEGORY_NAMES } from '@mercadia/demo-data';
import { EventBus, type AuthUser } from '@mercadia/service-kit';
import { CONFIG, type CatalogConfig } from '../config.js';
import { RatesService } from '../currency/rates.service.js';
import { StoreView } from '../stores/store.schema.js';
import type { CreateProductDto, QuoteItemDto, UpdateProductDto } from './dto/product.dto.js';
import type { ProductQueryDto } from './dto/query.dto.js';
import { Product, type ProductDocument, type ProductStatus } from './product.schema.js';

const SEARCH_INDEX = 'products_search';

type ProductSummary = ReturnType<ProductsService['summary']>;

export interface SearchResult {
  items: ProductSummary[];
  total: number;
  page: number;
  pages: number;
  currency: Currency;
  facets: {
    brands: { name: string; count: number }[];
    categories: { slug: string; count: number }[];
    price: { min: number | null; max: number | null } | null;
  };
}

export interface Suggestion {
  slug: string;
  title: string;
  image?: string;
}

const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);

@Injectable()
export class ProductsService implements OnModuleInit {
  private readonly logger = new Logger(ProductsService.name);
  private atlasSearch = false;

  constructor(
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectModel(StoreView.name) private readonly stores: Model<StoreView>,
    @Inject(CONFIG) private readonly config: CatalogConfig,
    private readonly rates: RatesService,
    private readonly bus: EventBus,
  ) {}

  async onModuleInit() {
    await this.products.syncIndexes();
    if (this.config.useAtlasSearch) await this.ensureSearchIndex();
  }

  /**
   * Atlas Search (Lucene) gives typo tolerance and autocomplete. It exists on Atlas and on
   * the Atlas Local image; on plain MongoDB we fall back to the `$text` index.
   */
  private async ensureSearchIndex() {
    try {
      const existing = await this.products.collection.listSearchIndexes(SEARCH_INDEX).toArray();
      if (existing.length === 0) {
        await this.products.collection.createSearchIndex({
          name: SEARCH_INDEX,
          definition: {
            mappings: {
              dynamic: false,
              fields: {
                title: [{ type: 'string' }, { type: 'autocomplete', tokenization: 'edgeGram' }],
                brand: { type: 'string' },
                tags: { type: 'string' },
                description: { type: 'string' },
              },
            },
          },
        });
      }
      this.atlasSearch = true;
      this.logger.log('Atlas Search enabled');
    } catch (error) {
      this.logger.warn(`Atlas Search unavailable, using $text: ${String(error).slice(0, 120)}`);
    }
  }

  // ---------- shaping ----------

  private money(amountUsd: number | null, currency: Currency) {
    return amountUsd === null ? null : this.rates.fromUsd(amountUsd, currency);
  }

  summary(p: Product, currency: Currency) {
    return {
      id: p._id,
      slug: p.slug,
      title: p.title,
      brand: p.brand,
      category: p.category,
      image: p.images[0] ?? null,
      price: this.money(p.priceUsd, currency),
      compareAt: this.money(p.compareAtUsd, currency),
      currency,
      rating: { avg: p.ratingAvg, count: p.ratingCount },
      store: { id: p.storeId, name: p.storeName, slug: p.storeSlug },
      inStock: p.totalStock > 0,
    };
  }

  detail(p: Product, currency: Currency) {
    return {
      ...this.summary(p, currency),
      description: p.description,
      subcategory: p.subcategory,
      tags: p.tags,
      images: p.images,
      options: p.options,
      variants: p.variants.map((v) => ({ sku: v.sku, options: v.options, stock: v.stock })),
      specs: p.specs,
      taxRate: ivaRate(p.category),
      priceUsd: p.priceUsd,
      status: p.status,
      salesCount: p.salesCount,
      createdAt: p.createdAt,
    };
  }

  // ---------- public reads ----------

  categories() {
    return this.products
      .aggregate<{ _id: { category: string; subcategory: string }; count: number }>([
        { $match: { status: 'active' } },
        {
          $group: {
            _id: { category: '$category', subcategory: '$subcategory' },
            count: { $sum: 1 },
          },
        },
      ])
      .then((rows) =>
        CATEGORIES.map((c) => {
          const subs = rows.filter((r) => r._id.category === c.slug);
          return {
            slug: c.slug,
            name: c.name,
            icon: c.icon,
            count: subs.reduce((n, r) => n + r.count, 0),
            subcategories: c.sources
              .map((s) => ({
                slug: s,
                name: SUBCATEGORY_NAMES[s] ?? { en: s, es: s },
                count: subs.find((r) => r._id.subcategory === s)?.count ?? 0,
              }))
              .filter((s) => s.count > 0),
          };
        }),
      );
  }

  async search(query: ProductQueryDto): Promise<SearchResult> {
    const currency = query.currency ?? 'COP';
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;

    const filter: QueryFilter<Product> = { status: 'active' };
    if (query.category) filter.category = query.category;
    if (query.subcategory) filter.subcategory = query.subcategory;
    if (query.store) filter.storeSlug = query.store;
    if (query.brand) filter.brand = { $in: query.brand.split(',').map((b) => b.trim()) };
    if (query.inStock) filter.totalStock = { $gt: 0 };
    if (query.onSale) filter.compareAtUsd = { $ne: null };
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      filter.priceUsd = {};
      if (query.minPrice !== undefined)
        filter.priceUsd.$gte = this.rates.toUsd(query.minPrice * 100, currency);
      if (query.maxPrice !== undefined)
        filter.priceUsd.$lte = this.rates.toUsd(query.maxPrice * 100, currency);
    }

    const text = query.q?.trim();
    const pipeline: PipelineStage[] = [];
    let sort: Record<string, 1 | -1> | undefined;
    const sortBy = query.sort ?? (text ? 'relevance' : 'bestselling');

    if (text && this.atlasSearch) {
      pipeline.push({
        $search: {
          index: SEARCH_INDEX,
          compound: {
            should: [
              { autocomplete: { query: text, path: 'title', score: { boost: { value: 3 } } } },
              {
                text: {
                  query: text,
                  path: ['title', 'brand', 'tags', 'description'],
                  fuzzy: { maxEdits: 1, prefixLength: 2 },
                },
              },
            ],
            minimumShouldMatch: 1,
          },
        },
      } as PipelineStage);
      pipeline.push({ $addFields: { score: { $meta: 'searchScore' } } });
    } else if (text) {
      filter.$text = { $search: text };
      pipeline.push({ $match: filter }, { $addFields: { score: { $meta: 'textScore' } } });
    }
    if (!text || this.atlasSearch) pipeline.push({ $match: filter });

    sort = {
      relevance: text ? { score: -1 as const } : { salesCount: -1 as const },
      newest: { createdAt: -1 as const },
      price_asc: { priceUsd: 1 as const },
      price_desc: { priceUsd: -1 as const },
      rating: { ratingAvg: -1 as const, ratingCount: -1 as const },
      bestselling: { salesCount: -1 as const },
    }[sortBy];

    pipeline.push({
      $facet: {
        items: [{ $sort: { ...sort, _id: 1 } }, { $skip: (page - 1) * limit }, { $limit: limit }],
        total: [{ $count: 'n' }],
        brands: [
          { $match: { brand: { $ne: null } } },
          { $group: { _id: '$brand', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ],
        categories: [
          { $group: { _id: '$category', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ],
        price: [{ $group: { _id: null, min: { $min: '$priceUsd' }, max: { $max: '$priceUsd' } } }],
      },
    });

    let result: {
      items: Product[];
      total: { n: number }[];
      brands: { _id: string; count: number }[];
      categories: { _id: string; count: number }[];
      price: { min: number; max: number }[];
    };
    try {
      [result] = await this.products.aggregate(pipeline);
    } catch (error) {
      if (!this.atlasSearch || !text) throw error;
      // The search index may still be building right after a fresh deploy.
      this.logger.warn(
        `Atlas Search query failed, retrying with $text: ${String(error).slice(0, 100)}`,
      );
      this.atlasSearch = false;
      return this.search(query);
    }

    const total = result.total[0]?.n ?? 0;
    return {
      items: result.items.map((p) => this.summary(p, currency)),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      currency,
      facets: {
        brands: result.brands.map((b) => ({ name: b._id, count: b.count })),
        categories: result.categories.map((c) => ({ slug: c._id, count: c.count })),
        price: result.price[0]
          ? {
              min: this.money(result.price[0].min, currency),
              max: this.money(result.price[0].max, currency),
            }
          : null,
      },
    };
  }

  /** Autocomplete for the search box. */
  async suggest(q: string): Promise<Suggestion[]> {
    const text = q.trim();
    if (text.length < 2) return [];
    const pipeline: PipelineStage[] = this.atlasSearch
      ? [
          {
            $search: {
              index: SEARCH_INDEX,
              autocomplete: { query: text, path: 'title', fuzzy: { maxEdits: 1 } },
            },
          } as PipelineStage,
          { $match: { status: 'active' } },
        ]
      : [
          {
            $match: {
              status: 'active',
              title: { $regex: text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' },
            },
          },
        ];
    pipeline.push(
      { $limit: 8 },
      { $project: { _id: 0, slug: 1, title: 1, image: { $first: '$images' } } },
    );
    try {
      return await this.products.aggregate(pipeline);
    } catch {
      this.atlasSearch = false;
      return this.suggest(q);
    }
  }

  async bySlug(slug: string, currency: Currency) {
    const product = await this.products.findOne({ slug, status: 'active' }).lean();
    if (!product) throw new NotFoundException('Product not found');
    const store = await this.stores.findById(product.storeId).lean();
    return {
      ...this.detail(product, currency),
      store: {
        ...this.summary(product, currency).store,
        ...(store && { city: store.city, logoUrl: store.logoUrl, accentColor: store.accentColor }),
      },
    };
  }

  async byIds(ids: string[], currency: Currency) {
    const found = await this.products
      .find({ _id: { $in: ids.slice(0, 100) }, status: 'active' })
      .lean();
    return found.map((p) => this.summary(p, currency));
  }

  async related(slug: string, currency: Currency) {
    const product = await this.products.findOne({ slug }).lean();
    if (!product) throw new NotFoundException();
    const items = await this.products
      .find({ _id: { $ne: product._id }, status: 'active', subcategory: product.subcategory })
      .sort({ salesCount: -1 })
      .limit(8)
      .lean();
    return items.map((p) => this.summary(p, currency));
  }

  /**
   * Searchable text of active products, for the AI service's embeddings. With `ids`, returns
   * those products whatever their status, so the caller can drop the unpublished ones.
   */
  async export(ids?: string[]) {
    const filter: QueryFilter<Product> = ids?.length ? { _id: { $in: ids } } : { status: 'active' };
    const rows = await this.products
      .find(filter)
      .select({
        slug: 1,
        title: 1,
        description: 1,
        brand: 1,
        category: 1,
        subcategory: 1,
        tags: 1,
        storeId: 1,
        storeName: 1,
        priceUsd: 1,
        ratingAvg: 1,
        salesCount: 1,
        status: 1,
        updatedAt: 1,
      })
      .lean();
    return rows.map(({ _id, ...rest }) => ({ id: _id, ...rest }));
  }

  /** Authoritative prices and availability for checkout (called by orders). */
  async quote(items: QuoteItemDto[]) {
    const products = await this.products
      .find({ _id: { $in: items.map((i) => i.productId) } })
      .lean();
    return items.map((item) => {
      const product = products.find((p) => p._id === item.productId);
      const variant = product?.variants.find((v) => v.sku === item.sku);
      if (!product || !variant || product.status !== 'active') {
        return { ...item, available: false, reason: 'not_found' as const };
      }
      return {
        ...item,
        available: variant.stock >= item.quantity,
        reason: variant.stock >= item.quantity ? null : ('insufficient_stock' as const),
        stock: variant.stock,
        title: product.title,
        image: product.images[0] ?? null,
        options: variant.options,
        storeId: product.storeId,
        storeName: product.storeName,
        category: product.category,
        unitPriceUsd: product.priceUsd,
        weightGrams: product.specs?.weightGrams ?? 500,
      };
    });
  }

  // ---------- seller ----------

  private async owned(id: string, user: AuthUser): Promise<ProductDocument> {
    const product = await this.products.findById(id);
    if (!product) throw new NotFoundException('Product not found');
    const isAdmin = user.roles.includes('admin');
    if (product.storeId !== user.storeId && !isAdmin) throw new ForbiddenException();
    return product;
  }

  private async uniqueSlug(title: string) {
    const base = slugify(title) || 'product';
    const exists = await this.products.exists({ slug: base });
    return exists ? `${base}-${randomBytes(3).toString('hex')}` : base;
  }

  private normaliseVariants(
    variants: { sku?: string; options: Record<string, string>; stock: number }[],
    slug: string,
  ) {
    const skus = new Set<string>();
    return variants.map((v, i) => {
      const sku = (
        v.sku ??
        `${slug.slice(0, 20)}-${Object.values(v.options).join('-') || i + 1}-${randomBytes(2).toString('hex')}`
      )
        .toUpperCase()
        .replace(/[^A-Z0-9-]/g, '');
      if (skus.has(sku)) throw new BadRequestException(`Duplicate SKU ${sku}`);
      skus.add(sku);
      return { sku, options: v.options, stock: v.stock };
    });
  }

  async sellerList(user: AuthUser, status?: ProductStatus) {
    if (!user.storeId) return [];
    const filter: QueryFilter<Product> = { storeId: user.storeId };
    if (status) filter.status = status;
    const items = await this.products.find(filter).sort({ updatedAt: -1 }).limit(200).lean();
    return items.map((p) => ({
      ...this.summary(p, 'COP'),
      status: p.status,
      totalStock: p.totalStock,
      salesCount: p.salesCount,
      priceUsd: p.priceUsd,
      updatedAt: p.updatedAt,
      lowStock: p.variants.some((v) => v.stock <= 3),
    }));
  }

  async sellerGet(id: string, user: AuthUser) {
    return this.detail(await this.owned(id, user), 'COP');
  }

  async create(dto: CreateProductDto, user: AuthUser) {
    if (!user.storeId) throw new ForbiddenException('Open a store first');
    const store = await this.stores.findById(user.storeId).lean();
    if (!store) throw new ConflictException('Store is not ready yet, try again in a few seconds');
    const slug = await this.uniqueSlug(dto.title);
    const variants = this.normaliseVariants(dto.variants, slug);
    try {
      const product = await this.products.create({
        storeId: store._id,
        storeName: store.name,
        storeSlug: store.slug,
        slug,
        title: dto.title,
        description: dto.description,
        brand: dto.brand ?? null,
        category: dto.category,
        subcategory: dto.subcategory,
        tags: dto.tags ?? [],
        images: dto.images,
        priceUsd: this.rates.toUsd(dto.price.amount, dto.price.currency),
        compareAtUsd: dto.compareAt
          ? this.rates.toUsd(dto.compareAt.amount, dto.compareAt.currency)
          : null,
        options: dto.options ?? [],
        variants,
        totalStock: variants.reduce((n, v) => n + v.stock, 0),
        specs: { weightGrams: dto.weightGrams ?? 500 },
        status: dto.status ?? 'draft',
      });
      if (product.status === 'active') await this.publishPublished(product);
      return this.detail(product.toObject(), 'COP');
    } catch (error) {
      if (String(error).includes('E11000'))
        throw new ConflictException('A variant SKU is already in use');
      throw error;
    }
  }

  async update(id: string, dto: UpdateProductDto, user: AuthUser) {
    const product = await this.owned(id, user);
    if (product.status === 'blocked')
      throw new ForbiddenException('This product was blocked by moderation');
    const wasActive = product.status === 'active';
    const oldPrice = product.priceUsd;

    const { price, compareAt, variants, weightGrams, ...rest } = dto;
    // DTO class fields exist even when omitted; only apply what the client actually sent.
    Object.assign(
      product,
      Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)),
    );
    if (price) product.priceUsd = this.rates.toUsd(price.amount, price.currency);
    if (compareAt !== undefined) {
      product.compareAtUsd = compareAt
        ? this.rates.toUsd(compareAt.amount, compareAt.currency)
        : null;
    }
    if (variants) {
      product.variants = this.normaliseVariants(variants, product.slug) as never;
      product.totalStock = variants.reduce((n, v) => n + v.stock, 0);
    }
    if (weightGrams) product.specs = { ...product.specs, weightGrams };
    try {
      await product.save();
    } catch (error) {
      if (String(error).includes('E11000'))
        throw new ConflictException('A variant SKU is already in use');
      throw error;
    }

    const isActive = product.status === 'active';
    if (isActive && !wasActive) await this.publishPublished(product);
    else if (!isActive && wasActive) {
      await this.bus.publish('product.unpublished', {
        productId: product._id,
        storeId: product.storeId,
      });
    } else if (isActive) {
      await this.bus.publish('product.updated', {
        productId: product._id,
        storeId: product.storeId,
        title: product.title,
        category: product.category,
      });
    }
    if (isActive && wasActive && product.priceUsd !== oldPrice) {
      await this.bus.publish('product.price_changed', {
        productId: product._id,
        title: product.title,
        oldPriceUsd: oldPrice,
        newPriceUsd: product.priceUsd,
      });
    }
    return this.detail(product.toObject(), 'COP');
  }

  private publishPublished(product: Product) {
    return this.bus.publish('product.published', {
      productId: product._id,
      storeId: product.storeId,
      title: product.title,
      category: product.category,
      priceUsd: product.priceUsd,
      imageUrl: product.images[0],
    });
  }

  // ---------- admin ----------

  async adminList(status?: ProductStatus, q?: string) {
    const filter: QueryFilter<Product> = {};
    if (status) filter.status = status;
    if (q) filter.title = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const items = await this.products.find(filter).sort({ updatedAt: -1 }).limit(100).lean();
    return items.map((p) => ({
      ...this.summary(p, 'USD'),
      status: p.status,
      updatedAt: p.updatedAt,
    }));
  }

  async moderate(id: string, status: 'active' | 'blocked') {
    const product = await this.products.findByIdAndUpdate(id, { status }, { new: true });
    if (!product) throw new NotFoundException();
    if (status === 'blocked') {
      await this.bus.publish('product.unpublished', { productId: id, storeId: product.storeId });
    } else {
      await this.publishPublished(product);
    }
    return { id, status };
  }

  async stats() {
    const [row] = await this.products.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          outOfStock: { $sum: { $cond: [{ $lte: ['$totalStock', 0] }, 1, 0] } },
          units: { $sum: '$totalStock' },
        },
      },
    ]);
    return row ?? { total: 0, active: 0, outOfStock: 0, units: 0 };
  }

  // ---------- event projections ----------

  async applyRating(productId: string, rating: number) {
    const product = await this.products.findById(productId, { ratingAvg: 1, ratingCount: 1 });
    if (!product) return;
    const count = product.ratingCount + 1;
    const avg = (product.ratingAvg * product.ratingCount + rating) / count;
    await this.products.updateOne(
      { _id: productId },
      { ratingCount: count, ratingAvg: Math.round(avg * 100) / 100 },
    );
  }
}
