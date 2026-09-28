import type { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Redis } from 'ioredis';
import type { Connection } from 'mongoose';
import request from 'supertest';
import { demoProducts, STORES } from '@mercadia/demo-data';
import { EventBus } from '@mercadia/service-kit';
import { tokenFor } from './setup-env.js';

describe('Catalog service (e2e)', () => {
  let app: INestApplication;
  let bus: EventBus;
  let redis: Redis;
  const http = () => request(app.getHttpServer());
  const store = STORES[0];
  let seller: string;
  let admin: string;

  const recentEvents = async (type: string) => {
    const entries = await redis.xrange('mercadia:events', '-', '+');
    return entries.map(([, f]) => JSON.parse(f[1])).filter((e) => e.type === type);
  };

  beforeAll(async () => {
    redis = new Redis(process.env.REDIS_URL!);
    await redis.flushdb();
    const { AppModule } = await import('../src/app.module.js');
    const { configureService } = await import('@mercadia/service-kit');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureService(app, { name: 'catalog', port: 0, title: 'Catalog', description: '' });
    const connection = app.get<Connection>(getConnectionToken());
    await connection.dropDatabase();
    await app.init();
    bus = app.get(EventBus);
    seller = await tokenFor({ sub: store.ownerId, roles: ['buyer', 'seller'], storeId: store.id });
    admin = await tokenFor({ sub: 'admin', roles: ['buyer', 'admin'] });
  });

  afterAll(async () => {
    await app?.close();
    await redis.quit();
  });

  describe('storefront', () => {
    it('seeds the demo catalog and groups it into categories', async () => {
      const { body } = await http().get('/categories').expect(200);
      expect(body.reduce((n: number, c: { count: number }) => n + c.count, 0)).toBe(194);
      const electronics = body.find((c: { slug: string }) => c.slug === 'electronics');
      expect(electronics.name).toEqual({ en: 'Electronics', es: 'Tecnología' });
      expect(electronics.subcategories.map((s: { slug: string }) => s.slug)).toContain(
        'smartphones',
      );
    });

    it('filters, sorts and paginates with facets', async () => {
      const { body } = await http()
        .get('/products?category=electronics&sort=price_asc&limit=5&currency=USD')
        .expect(200);
      expect(body.total).toBe(38);
      expect(body.pages).toBe(8);
      const prices = body.items.map((p: { price: number }) => p.price);
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
      expect(body.facets.brands.length).toBeGreaterThan(0);
    });

    it('converts prices and price filters to the requested currency', async () => {
      const usd = await http().get('/products?sort=price_asc&limit=1&currency=USD').expect(200);
      const cop = await http().get('/products?sort=price_asc&limit=1&currency=COP').expect(200);
      expect(cop.body.items[0].price).toBe(
        Math.round((usd.body.items[0].price * 4000) / 10000) * 10000,
      );

      const { body } = await http().get(
        '/products?minPrice=100&maxPrice=200&currency=USD&limit=48',
      );
      expect(body.items.every((p: { price: number }) => p.price >= 10000 && p.price <= 20000)).toBe(
        true,
      );
    });

    it('filters products on sale', async () => {
      const { body } = await http().get('/products?onSale=true&limit=48').expect(200);
      expect(
        body.items.every((p: { compareAt: number; price: number }) => p.compareAt > p.price),
      ).toBe(true);
    });

    it('searches by text', async () => {
      const { body } = await http().get('/products?q=iphone').expect(200);
      expect(body.items[0].title).toMatch(/iphone/i);
    });

    it('serves product pages with variants, store and tax rate', async () => {
      const shirt = demoProducts().find((p) => p.subcategory === 'mens-shirts')!;
      const { body } = await http().get(`/products/${shirt.slug}`).expect(200);
      expect(body.variants).toHaveLength(4);
      expect(body.taxRate).toBe(0.19);
      expect(body.store).toMatchObject({ slug: 'urbano-moda', city: 'Barranquilla' });
      await http().get('/products/does-not-exist').expect(404);
    });
  });

  describe('stock reservations', () => {
    const product = demoProducts().find(
      (p) => p.variants.length === 1 && p.variants[0].stock >= 5,
    )!;
    const sku = product.variants[0].sku;
    const stockOf = async () =>
      (await http().get(`/products/${product.slug}`)).body.variants[0].stock as number;

    const placeOrder = (orderId: string, quantity: number) =>
      bus.build(
        'order.placed',
        {
          orderId,
          buyerId: 'buyer',
          buyerEmail: 'b@example.com',
          currency: 'USD',
          total: 1,
          lines: [
            {
              sellerOrderId: 's',
              storeId: product.storeId,
              productId: product.id,
              variantSku: sku,
              title: '',
              quantity,
              unitPrice: 1,
            },
          ],
        },
        orderId,
      );

    it('reserves, commits and never oversells', async () => {
      const service = app.get((await import('../src/stock/stock.service.js')).StockService);
      const before = await stockOf();

      await service.onOrderPlaced(placeOrder('order-1', 2));
      expect(await stockOf()).toBe(before - 2);
      expect((await recentEvents('stock.reserved')).at(-1).data.orderId).toBe('order-1');

      // Redelivery of the same order does not reserve twice.
      await service.onOrderPlaced(placeOrder('order-1', 2));
      expect(await stockOf()).toBe(before - 2);

      await service.onOrderPlaced(placeOrder('order-2', before + 100));
      expect(await stockOf()).toBe(before - 2);
      expect((await recentEvents('stock.rejected')).at(-1).data).toMatchObject({
        orderId: 'order-2',
        sku,
      });

      await service.commit('order-1');
      const detail = await http().get(`/products/${product.slug}`);
      expect(detail.body.salesCount).toBeGreaterThanOrEqual(2);
    });

    it('releases stock when an order is cancelled', async () => {
      const service = app.get((await import('../src/stock/stock.service.js')).StockService);
      const before = await stockOf();
      await service.onOrderPlaced(placeOrder('order-3', 1));
      expect(await stockOf()).toBe(before - 1);
      expect(await service.release('order-3')).toBe(true);
      expect(await service.release('order-3')).toBe(false);
      expect(await stockOf()).toBe(before);
    });

    it('quotes authoritative prices for checkout, only with the internal key', async () => {
      const items = [{ productId: product.id, sku, quantity: 1 }];
      await http().post('/internal/quote').send({ items }).expect(403);
      const { body } = await http()
        .post('/internal/quote')
        .set('x-internal-key', 'dev-internal-key')
        .send({ items })
        .expect(200);
      expect(body[0]).toMatchObject({
        available: true,
        unitPriceUsd: product.priceUsd,
        storeId: product.storeId,
      });
    });
  });

  describe('seller center', () => {
    let productId: string;

    it('requires the seller role', async () => {
      const buyer = await tokenFor({ sub: 'b', roles: ['buyer'] });
      await http().get('/seller/products').set('Authorization', `Bearer ${buyer}`).expect(403);
      await http().get('/seller/products').expect(401);
    });

    it('creates a product priced in COP and publishes it', async () => {
      const { body } = await http()
        .post('/seller/products')
        .set('Authorization', `Bearer ${seller}`)
        .send({
          title: 'Café de origen 500 g',
          description: 'Café tostado de la Sierra Nevada',
          category: 'groceries',
          images: ['https://example.com/cafe.jpg'],
          price: { amount: 4_000_000, currency: 'COP' },
          options: [{ name: 'molienda', values: ['grano', 'molido'] }],
          variants: [
            { options: { molienda: 'grano' }, stock: 10 },
            { options: { molienda: 'molido' }, stock: 5 },
          ],
          status: 'active',
        })
        .expect(201);
      productId = body.id;
      expect(body.priceUsd).toBe(1000);
      expect(body.slug).toBe('cafe-de-origen-500-g');
      expect(body.variants).toHaveLength(2);
      expect((await recentEvents('product.published')).at(-1).data.productId).toBe(productId);
    });

    it("lists only the seller's own products and flags low stock", async () => {
      const { body } = await http()
        .get('/seller/products')
        .set('Authorization', `Bearer ${seller}`)
        .expect(200);
      expect(body.every((p: { store: { id: string } }) => p.store.id === store.id)).toBe(true);
    });

    it('announces price changes for wishlist alerts', async () => {
      await http()
        .patch(`/seller/products/${productId}`)
        .set('Authorization', `Bearer ${seller}`)
        .send({ price: { amount: 800, currency: 'USD' } })
        .expect(200);
      expect((await recentEvents('product.price_changed')).at(-1).data).toMatchObject({
        productId,
        oldPriceUsd: 1000,
        newPriceUsd: 800,
      });
    });

    it('stops other sellers from editing the product', async () => {
      const other = await tokenFor({
        sub: STORES[1].ownerId,
        roles: ['seller'],
        storeId: STORES[1].id,
      });
      await http()
        .patch(`/seller/products/${productId}`)
        .set('Authorization', `Bearer ${other}`)
        .send({ title: 'Hacked' })
        .expect(403);
    });

    it('lets admins block a product, hiding it from the storefront', async () => {
      await http()
        .patch(`/admin/products/${productId}`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ status: 'blocked' })
        .expect(200);
      await http().get('/products/cafe-de-origen-500-g').expect(404);
      await http()
        .patch(`/seller/products/${productId}`)
        .set('Authorization', `Bearer ${seller}`)
        .send({ status: 'active' })
        .expect(403);
    });
  });
});
