import type { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import type { Connection } from 'mongoose';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { BUYER, catalogPriceUsd, OWNER, PRODUCT, STORE, token } from './setup-env.js';

describe('Engagement service (e2e)', () => {
  let app: INestApplication;
  let url: string;
  let buyer: string;
  let seller: string;
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module.js');
    const { configureService } = await import('@mercadia/service-kit');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureService(app, { name: 'engagement', port: 0, title: 'Engagement', description: '' });
    const db = app.get<Connection>(getConnectionToken());
    await db.dropDatabase();
    // Dropping the database also drops the unique indexes Mongoose built at startup.
    await Promise.all(Object.values(db.models).map((m) => m.syncIndexes()));
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    const { StoreOwner } = await import('../src/schemas.js');
    await app
      .get<Connection>(getConnectionToken())
      .model(StoreOwner.name)
      .create({ _id: STORE, ownerId: OWNER, name: 'Casa', slug: 'casa' });
    buyer = await token(BUYER);
    seller = await token(OWNER, ['buyer', 'seller'], STORE, 'Valentina Ríos');
  });

  afterAll(() => app?.close());

  describe('reviews', () => {
    let reviewId: string;

    it('only accepts reviews from buyers who received the product', async () => {
      const stranger = await token('0f3a5c1e-9999-4a1b-8c1d-000000000009');
      await http()
        .post('/reviews')
        .set(as(stranger))
        .send({ productId: PRODUCT, rating: 5, comment: 'Excelente lámpara' })
        .expect(403);
      const res = await http()
        .post('/reviews')
        .set(as(buyer))
        .send({
          productId: PRODUCT,
          rating: 4,
          title: 'Muy buena',
          comment: 'Ilumina muy bien el escritorio',
        })
        .expect(201);
      reviewId = res.body._id;
      expect(res.body).toMatchObject({ storeId: STORE, verified: true, authorName: 'Laura G.' });
      await http()
        .post('/reviews')
        .set(as(buyer))
        .send({ productId: PRODUCT, rating: 1, comment: 'Otra reseña más' })
        .expect(409);
    });

    it('summarises ratings per product and per store', async () => {
      const res = await http().get(`/reviews/products/${PRODUCT}`).expect(200);
      expect(res.body.summary).toMatchObject({ avg: 4, count: 1, distribution: [0, 0, 0, 1, 0] });
      const rep = await http().get(`/reputation/stores/${STORE}`).expect(200);
      expect(rep.body).toMatchObject({ avg: 4, count: 1, replyRate: 0 });
    });

    it('counts each helpful vote once', async () => {
      await http().post(`/reviews/${reviewId}/helpful`).set(as(seller)).expect(200);
      const res = await http().post(`/reviews/${reviewId}/helpful`).set(as(seller)).expect(200);
      expect(res.body.helpful).toBe(1);
    });

    it("lets only the store's seller reply, once", async () => {
      const otherSeller = await token(
        '0f3a5c1e-7777-4a1b-8c1d-000000000007',
        ['seller'],
        '22222222-2222-4222-8222-222222222222',
      );
      await http()
        .post(`/reviews/${reviewId}/reply`)
        .set(as(otherSeller))
        .send({ text: 'Gracias' })
        .expect(403);
      await http()
        .post(`/reviews/${reviewId}/reply`)
        .set(as(seller))
        .send({ text: '¡Gracias por tu compra!' })
        .expect(200);
      await http()
        .post(`/reviews/${reviewId}/reply`)
        .set(as(seller))
        .send({ text: 'Otra vez' })
        .expect(400);
      expect((await http().get(`/reputation/stores/${STORE}`)).body.replyRate).toBe(1);
    });
  });

  describe('chat and live delivery', () => {
    let socket: Socket;

    afterAll(() => socket?.close());

    it('rejects sockets without a valid token', async () => {
      const bad = io(url, {
        path: '/realtime/socket.io',
        auth: { token: 'nope' },
        transports: ['websocket'],
      });
      await new Promise<void>((resolve) => bad.on('disconnect', () => resolve()));
      bad.close();
    });

    it('delivers a buyer message to the seller in real time and notifies them', async () => {
      socket = io(url, {
        path: '/realtime/socket.io',
        auth: { token: seller },
        transports: ['websocket'],
      });
      await new Promise((r) => socket.on('connect', r));
      const received = new Promise<{ message: { text: string } }>((r) => socket.on('message', r));
      const notified = new Promise<{ type: string }>((r) => socket.on('notification', r));

      const res = await http()
        .post('/conversations')
        .set(as(buyer))
        .send({ storeId: STORE, productId: PRODUCT, text: '¿Tienen en color negro?' })
        .expect(201);
      expect((await received).message.text).toBe('¿Tienen en color negro?');
      expect((await notified).type).toBe('new_message');
      expect(res.body.conversation).toMatchObject({ productTitle: 'Lámpara', unreadSeller: 1 });
    });

    it('reuses the conversation, tracks unread counts and blocks outsiders', async () => {
      await http()
        .post('/conversations')
        .set(as(buyer))
        .send({ storeId: STORE, productId: PRODUCT, text: 'Y en blanco?' })
        .expect(201);
      const [conversation] = (
        await http().get('/conversations?as=seller').set(as(seller)).expect(200)
      ).body;
      expect(conversation.unreadSeller).toBe(2);
      const history = await http()
        .get(`/conversations/${conversation._id}`)
        .set(as(seller))
        .expect(200);
      expect(history.body.messages).toHaveLength(2);
      expect(
        (await http().get('/conversations?as=seller').set(as(seller))).body[0].unreadSeller,
      ).toBe(0);

      const stranger = await token('0f3a5c1e-9999-4a1b-8c1d-000000000009');
      await http().get(`/conversations/${conversation._id}`).set(as(stranger)).expect(403);
      await http()
        .post('/conversations')
        .set(as(seller))
        .send({ storeId: STORE, text: 'hola' })
        .expect(403);
    });
  });

  describe('wishlist and notifications', () => {
    it('alerts wishlist users when the price drops below what they saw', async () => {
      await http().post('/wishlist').set(as(buyer)).send({ productId: 'nope' }).expect(404);
      await http().post('/wishlist').set(as(buyer)).send({ productId: PRODUCT }).expect(204);
      catalogPriceUsd.value = 4000;
      // Saving again keeps the original price, so the drop stays visible.
      await http().post('/wishlist').set(as(buyer)).send({ productId: PRODUCT }).expect(204);
      const saved = await http().get('/wishlist?currency=COP').set(as(buyer)).expect(200);
      expect(saved.body).toMatchObject([
        {
          productId: PRODUCT,
          priceUsdAtAdd: 5000,
          dropPercent: 20,
          product: { price: 160000, currency: 'COP' },
        },
      ]);
      expect((await http().get('/wishlist/ids').set(as(buyer))).body).toEqual([PRODUCT]);

      const { EventNotifications } = await import('../src/notifications/event-notifications.js');
      const { EventBus } = await import('@mercadia/service-kit');
      app.get(EventNotifications); // handlers registered on the bus
      const bus = app.get(EventBus);
      await bus.dispatch(
        '1-0',
        JSON.stringify(
          bus.build('product.price_changed', {
            productId: PRODUCT,
            title: 'Lámpara',
            oldPriceUsd: 5000,
            newPriceUsd: 4000,
          }),
        ),
      );

      const list = await http().get('/notifications').set(as(buyer)).expect(200);
      expect(list.body.map((n: { type: string }) => n.type)).toContain('price_drop');
      expect((await http().get('/notifications/unread').set(as(buyer))).body.count).toBeGreaterThan(
        0,
      );
      await http().post('/notifications/read').set(as(buyer)).send({}).expect(204);
      expect((await http().get('/notifications/unread').set(as(buyer))).body.count).toBe(0);
    });
  });
});
