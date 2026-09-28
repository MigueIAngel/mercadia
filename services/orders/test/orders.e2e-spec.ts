import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { catalogStock, resetDatabase, STORE_A, STORE_B, token } from './setup-env.js';

const BUYER = '0f3a5c1e-1111-4a1b-8c1d-000000000001';
const OTHER = '0f3a5c1e-2222-4a1b-8c1d-000000000002';
const ADDRESS = {
  fullName: 'Laura Gómez',
  phone: '3001234567',
  line1: 'Calle 72 # 10-34',
  city: 'Bogotá',
  department: 'Cundinamarca',
  country: 'CO',
};

describe('Orders service (e2e)', () => {
  let app: INestApplication;
  let db: pg.Client;
  let buyer: string;
  const http = () => request(app.getHttpServer());
  let orders: import('../src/orders/orders.service.js').OrdersService;

  const outboxTypes = async (orderId: string) =>
    (
      await db.query(
        `SELECT payload->>'type' AS type FROM outbox WHERE payload->>'correlationId' = $1 ORDER BY id`,
        [orderId],
      )
    ).rows.map((r) => r.type);

  const addItem = (sku: string, quantity: number, headers: Record<string, string>) =>
    http()
      .post('/cart/items')
      .set(headers)
      .send({
        productId: sku === 'SHIRT-M' ? 'p-shirt' : sku === 'LAMP-1' ? 'p-lamp' : 'p-rice',
        sku,
        quantity,
      });

  const placeOrder = async (auth: string) => {
    await addItem('SHIRT-M', 2, { Authorization: `Bearer ${auth}` }).expect(204);
    await addItem('LAMP-1', 1, { Authorization: `Bearer ${auth}` }).expect(204);
    const res = await http()
      .post('/checkout')
      .set('Authorization', `Bearer ${auth}`)
      .send({ currency: 'COP', address: ADDRESS })
      .expect(201);
    return res.body;
  };

  beforeAll(async () => {
    await resetDatabase();
    process.env.SEED_DEMO_DATA = 'false';
    const { AppModule } = await import('../src/app.module.js');
    const { configureService } = await import('@mercadia/service-kit');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureService(app, { name: 'orders', port: 0, title: 'Orders', description: '' });
    await app.init();
    orders = app.get((await import('../src/orders/orders.service.js')).OrdersService);
    db = new pg.Client({ connectionString: process.env.ORDERS_DATABASE_URL });
    await db.connect();
    buyer = await token(BUYER);
  });

  afterAll(async () => {
    await db?.end();
    await app?.close();
  });

  describe('cart', () => {
    it('keeps a guest cart by anonymous id and prices it in the chosen currency', async () => {
      const guest = { 'x-cart-id': randomUUID() };
      await addItem('SHIRT-M', 2, guest).expect(204);
      const cop = await http().get('/cart?currency=COP').set(guest).expect(200);
      expect(cop.body).toMatchObject({ count: 2, subtotal: 2 * 10_000_000 });
      const usd = await http().get('/cart?currency=USD').set(guest).expect(200);
      expect(usd.body.subtotal).toBe(5000);
    });

    it('rejects quantities above the available stock', async () => {
      await addItem('LAMP-1', 5, { 'x-cart-id': randomUUID() }).expect(400);
    });

    it('requires a cart id for guests', async () => {
      await http().get('/cart').expect(400);
      await http().get('/cart').set('x-cart-id', 'not-a-uuid').expect(400);
    });

    it('merges the guest cart into the account cart at sign-in', async () => {
      const guestId = randomUUID();
      const user = await token('0f3a5c1e-3333-4a1b-8c1d-000000000003');
      await addItem('RICE-1', 3, { 'x-cart-id': guestId }).expect(204);
      await addItem('RICE-1', 1, { Authorization: `Bearer ${user}` }).expect(204);
      const merged = await http()
        .get('/cart')
        .set({ 'x-cart-id': guestId, Authorization: `Bearer ${user}` })
        .expect(200);
      expect(merged.body.count).toBe(4);
      // The guest cart is gone afterwards.
      const guest = await http().get('/cart').set('x-cart-id', guestId).expect(200);
      expect(guest.body.count).toBe(0);
    });

    it('updates and removes lines', async () => {
      const guest = { 'x-cart-id': randomUUID() };
      await addItem('RICE-1', 1, guest).expect(204);
      await http().patch('/cart/items/RICE-1').set(guest).send({ quantity: 5 }).expect(204);
      expect((await http().get('/cart/count').set(guest)).body.count).toBe(5);
      await http().delete('/cart/items/RICE-1').set(guest).expect(204);
      expect((await http().get('/cart/count').set(guest)).body.count).toBe(0);
    });
  });

  describe('checkout', () => {
    it('requires authentication', async () => {
      await http().post('/checkout').send({ currency: 'COP', address: ADDRESS }).expect(401);
    });

    it('splits the order per store with shipping, IVA and commission', async () => {
      const order = await placeOrder(buyer);
      expect(order.status).toBe('pending_payment');
      expect(order.number).toBeGreaterThanOrEqual(5000);
      expect(order.sellerOrders).toHaveLength(2);
      const shirt = order.sellerOrders.find((s: { storeId: string }) => s.storeId === STORE_A);
      expect(shirt).toMatchObject({ subtotal: 20_000_000, commission: 1_600_000 });
      expect(order.total).toBe(order.subtotal + order.shippingTotal);
      expect(order.taxTotal).toBeGreaterThan(0);
      expect(await outboxTypes(order.id)).toEqual(['order.placed']);
      expect(
        (await http().get('/cart/count').set('Authorization', `Bearer ${buyer}`)).body.count,
      ).toBe(0);
    });

    it('refuses to sell what is no longer in stock', async () => {
      await addItem('LAMP-1', 3, { Authorization: `Bearer ${buyer}` }).expect(204);
      catalogStock.set('LAMP-1', 1);
      const res = await http()
        .post('/checkout')
        .set('Authorization', `Bearer ${buyer}`)
        .send({ currency: 'COP', address: ADDRESS })
        .expect(409);
      expect(res.body.unavailable[0]).toMatchObject({
        sku: 'LAMP-1',
        reason: 'insufficient_stock',
      });
      catalogStock.set('LAMP-1', 3);
      await http().delete('/cart/items/LAMP-1').set('Authorization', `Bearer ${buyer}`).expect(204);
    });

    it('validates the address', async () => {
      await addItem('RICE-1', 1, { Authorization: `Bearer ${buyer}` }).expect(204);
      await http()
        .post('/checkout')
        .set('Authorization', `Bearer ${buyer}`)
        .send({ currency: 'COP', address: { ...ADDRESS, phone: 'x' } })
        .expect(400);
    });
  });

  describe('saga', () => {
    it('marks the order paid once, with events for the buyer and each seller', async () => {
      const order = await placeOrder(buyer);
      await orders.markPaid(order.id);
      await orders.markPaid(order.id);
      const res = await http()
        .get(`/orders/${order.id}`)
        .set('Authorization', `Bearer ${buyer}`)
        .expect(200);
      expect(res.body.status).toBe('paid');
      expect(res.body.sellerOrders.every((s: { status: string }) => s.status === 'paid')).toBe(
        true,
      );
      expect(await outboxTypes(order.id)).toEqual([
        'order.placed',
        'order.paid',
        'seller_order.status_changed',
        'seller_order.status_changed',
      ]);
    });

    it('cancels when the stock is rejected, and asks for a refund if it gets paid later', async () => {
      const order = await placeOrder(buyer);
      expect(await orders.cancel(order.id, 'out_of_stock:LAMP-1')).toBe(true);
      expect(await orders.cancel(order.id, 'again')).toBe(false);
      await orders.markPaid(order.id);
      const types = await outboxTypes(order.id);
      expect(types.filter((t) => t === 'order.cancelled')).toHaveLength(2);
      const res = await http().get(`/orders/${order.id}`).set('Authorization', `Bearer ${buyer}`);
      expect(res.body).toMatchObject({ status: 'cancelled', cancelReason: 'out_of_stock:LAMP-1' });
    });

    it('lets buyers cancel only unpaid orders', async () => {
      const order = await placeOrder(buyer);
      const other = await token(OTHER);
      await http()
        .post(`/orders/${order.id}/cancel`)
        .set('Authorization', `Bearer ${other}`)
        .expect(403);
      await http()
        .post(`/orders/${order.id}/cancel`)
        .set('Authorization', `Bearer ${buyer}`)
        .expect(200);
      await http()
        .post(`/orders/${order.id}/cancel`)
        .set('Authorization', `Bearer ${buyer}`)
        .expect(400);
    });

    it('cancels orders whose payment window expired', async () => {
      const order = await placeOrder(buyer);
      await db.query(
        `UPDATE orders SET payment_deadline = now() - interval '1 minute' WHERE id = $1`,
        [order.id],
      );
      expect(await orders.cancelExpired()).toBeGreaterThanOrEqual(1);
      expect(
        (await http().get(`/orders/${order.id}`).set('Authorization', `Bearer ${buyer}`)).body
          .cancelReason,
      ).toBe('payment_timeout');
    });
  });

  describe('sellers, shipping and refunds', () => {
    let order: { id: string; sellerOrders: { id: string; storeId: string; total: number }[] };
    let sellerA: string;

    beforeAll(async () => {
      order = await placeOrder(buyer);
      await orders.markPaid(order.id);
      sellerA = await token('0f3a5c1e-4444-4a1b-8c1d-000000000004', ['buyer', 'seller'], STORE_A);
    });

    it('shows each seller only their part of the order', async () => {
      const res = await http()
        .get(`/orders/${order.id}`)
        .set('Authorization', `Bearer ${sellerA}`)
        .expect(200);
      expect(res.body.sellerOrders.map((s: { storeId: string }) => s.storeId)).toEqual([STORE_A]);
      const list = await http()
        .get('/seller/orders')
        .set('Authorization', `Bearer ${sellerA}`)
        .expect(200);
      expect(list.body.every((s: { storeId: string }) => s.storeId === STORE_A)).toBe(true);
    });

    it('lets the seller accept, then follows the shipment until the order completes', async () => {
      const mine = order.sellerOrders.find((s) => s.storeId === STORE_A)!;
      const theirs = order.sellerOrders.find((s) => s.storeId === STORE_B)!;
      await http()
        .post(`/seller/orders/${mine.id}/accept`)
        .set('Authorization', `Bearer ${sellerA}`)
        .expect(200);
      await http()
        .post(`/seller/orders/${theirs.id}/accept`)
        .set('Authorization', `Bearer ${sellerA}`)
        .expect(404);

      await orders.setSellerStatus(mine.id, 'shipped', null, 'MC123');
      await orders.setSellerStatus(mine.id, 'delivered', null);
      let res = await http().get(`/orders/${order.id}`).set('Authorization', `Bearer ${buyer}`);
      expect(res.body.status).toBe('paid');
      await orders.setSellerStatus(theirs.id, 'delivered', null);
      res = await http().get(`/orders/${order.id}`).set('Authorization', `Bearer ${buyer}`);
      expect(res.body.status).toBe('completed');
      expect(
        res.body.sellerOrders.find((s: { id: string }) => s.id === mine.id).trackingNumber,
      ).toBe('MC123');
    });

    it('tracks partial and full refunds', async () => {
      const so = order.sellerOrders[0];
      await orders.applyRefund(so.id, 1000);
      let res = await http().get(`/orders/${order.id}`).set('Authorization', `Bearer ${buyer}`);
      expect(res.body.status).toBe('partially_refunded');
      for (const s of order.sellerOrders) await orders.applyRefund(s.id, s.total);
      res = await http().get(`/orders/${order.id}`).set('Authorization', `Bearer ${buyer}`);
      expect(res.body.status).toBe('refunded');
    });

    it('reports seller sales and admin stats', async () => {
      const sales = await http()
        .get('/seller/sales')
        .set('Authorization', `Bearer ${sellerA}`)
        .expect(200);
      expect(sales.body).toHaveProperty('revenue30d');
      await http().get('/admin/orders/stats').set('Authorization', `Bearer ${buyer}`).expect(403);
      const admin = await token('0f3a5c1e-5555-4a1b-8c1d-000000000005', ['buyer', 'admin']);
      const stats = await http()
        .get('/admin/orders/stats')
        .set('Authorization', `Bearer ${admin}`)
        .expect(200);
      expect(stats.body.orders).toBeGreaterThan(0);
    });
  });

  describe('service to service', () => {
    it('exposes order totals to payments with the internal key only', async () => {
      const order = await placeOrder(buyer);
      await http().get(`/internal/orders/${order.id}`).expect(403);
      const res = await http()
        .get(`/internal/orders/${order.id}`)
        .set('x-internal-key', 'dev-internal-key')
        .expect(200);
      expect(res.body.sellers).toHaveLength(2);
      expect(res.body.total).toBe(order.total);
    });
  });
});
