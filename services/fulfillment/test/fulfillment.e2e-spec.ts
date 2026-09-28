import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import {
  BUYER,
  ORDER_ID,
  resetDatabase,
  SELLER_ORDER_A,
  SELLER_ORDER_B,
  STORE_A,
  token,
} from './setup-env.js';

const ADDRESS = {
  fullName: 'Laura Gómez',
  phone: '3001234567',
  line1: 'Calle 72 # 10-34',
  city: 'Bogotá',
  department: 'Cundinamarca',
  country: 'CO',
};

describe('Fulfillment service (e2e)', () => {
  let app: INestApplication;
  let db: pg.Client;
  let buyer: string;
  let seller: string;
  let admin: string;
  let shipments: import('../src/shipments/shipments.service.js').ShipmentsService;
  let disputes: import('../src/disputes/disputes.service.js').DisputesService;
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const events = async (type: string) =>
    (
      await db.query(
        `SELECT payload->'data' AS data FROM outbox WHERE payload->>'type' = $1 ORDER BY id`,
        [type],
      )
    ).rows.map((r) => r.data);
  const setStatus = (id: string, status: string) =>
    db.query(
      `INSERT INTO seller_orders (id, order_id, store_id, buyer_id, status) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET status = $5, updated_at = now()`,
      [
        id,
        ORDER_ID,
        id === SELLER_ORDER_A ? STORE_A : '22222222-2222-4222-8222-222222222222',
        BUYER,
        status,
      ],
    );

  beforeAll(async () => {
    await resetDatabase();
    process.env.SEED_DEMO_DATA = 'false';
    process.env.TRACKING_STEP_SECONDS = '0';
    const { AppModule } = await import('../src/app.module.js');
    const { configureService } = await import('@mercadia/service-kit');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureService(app, { name: 'fulfillment', port: 0, title: 'Fulfillment', description: '' });
    await app.init();
    shipments = app.get((await import('../src/shipments/shipments.service.js')).ShipmentsService);
    disputes = app.get((await import('../src/disputes/disputes.service.js')).DisputesService);
    db = new pg.Client({ connectionString: process.env.FULFILLMENT_DATABASE_URL });
    await db.connect();
    buyer = await token(BUYER);
    seller = await token('0f3a5c1e-4444-4a1b-8c1d-000000000004', ['buyer', 'seller'], STORE_A);
    admin = await token('0f3a5c1e-5555-4a1b-8c1d-000000000005', ['buyer', 'admin']);
  });

  afterAll(async () => {
    await db?.end();
    await app?.close();
  });

  describe('addresses', () => {
    it('keeps exactly one default address', async () => {
      const first = await http().post('/addresses').set(as(buyer)).send(ADDRESS).expect(201);
      expect(first.body.isDefault).toBe(true);
      const second = await http()
        .post('/addresses')
        .set(as(buyer))
        .send({ ...ADDRESS, label: 'Oficina', isDefault: true })
        .expect(201);
      const list = await http().get('/addresses').set(as(buyer)).expect(200);
      expect(
        list.body
          .filter((a: { isDefault: boolean }) => a.isDefault)
          .map((a: { id: string }) => a.id),
      ).toEqual([second.body.id]);
    });

    it("never touches someone else's address", async () => {
      const other = await token('0f3a5c1e-9999-4a1b-8c1d-000000000009');
      const [address] = (await http().get('/addresses').set(as(buyer))).body;
      await http()
        .patch(`/addresses/${address.id}`)
        .set(as(other))
        .send({ label: 'x' })
        .expect(403);
    });
  });

  describe('rates', () => {
    it('quotes parcels for orders with the internal key', async () => {
      const body = {
        destination: { city: 'Cali', department: 'Valle del Cauca' },
        parcels: [{ storeId: 'x', weightGrams: 800, subtotalUsd: 1000 }],
      };
      await http().post('/internal/rates').send(body).expect(403);
      const res = await http()
        .post('/internal/rates')
        .set('x-internal-key', 'dev-internal-key')
        .send(body)
        .expect(200);
      expect(res.body[0]).toMatchObject({
        zone: 'national',
        costUsd: 600,
        carrier: 'Mercadia Envíos',
      });
    });
  });

  describe('shipments', () => {
    let tracking: string;

    it('only ships paid orders of the seller’s own store', async () => {
      await setStatus(SELLER_ORDER_A, 'pending_payment');
      await http()
        .post('/seller/shipments')
        .set(as(seller))
        .send({ sellerOrderId: SELLER_ORDER_A })
        .expect(400);
      await setStatus(SELLER_ORDER_B, 'paid');
      await http()
        .post('/seller/shipments')
        .set(as(seller))
        .send({ sellerOrderId: SELLER_ORDER_B })
        .expect(404);
    });

    it('creates a label and moves it through the simulated carrier to delivered', async () => {
      await setStatus(SELLER_ORDER_A, 'processing');
      const res = await http()
        .post('/seller/shipments')
        .set(as(seller))
        .send({ sellerOrderId: SELLER_ORDER_A })
        .expect(201);
      tracking = res.body.trackingNumber;
      expect(tracking).toMatch(/^MC\d{10}$/);
      await http()
        .post('/seller/shipments')
        .set(as(seller))
        .send({ sellerOrderId: SELLER_ORDER_A })
        .expect(409);

      for (let i = 0; i < 4; i++) await shipments.advanceDue();
      const track = await http().get(`/shipments/track/${tracking}`).expect(200);
      expect(track.body.status).toBe('delivered');
      expect(track.body.events.map((e: { status: string }) => e.status)).toEqual([
        'label_created',
        'in_transit',
        'out_for_delivery',
        'delivered',
      ]);
      expect(track.body).not.toHaveProperty('destination');
      expect((await events('shipment.status_changed')).map((e) => e.status)).toEqual([
        'label_created',
        'in_transit',
        'out_for_delivery',
        'delivered',
      ]);
    });

    it('shows shipments to the buyer of the order', async () => {
      const res = await http().get(`/shipments/orders/${ORDER_ID}`).set(as(buyer)).expect(200);
      expect(res.body[0].trackingNumber).toBe(tracking);
      const stranger = await token('0f3a5c1e-8888-4a1b-8c1d-000000000008');
      expect((await http().get(`/shipments/orders/${ORDER_ID}`).set(as(stranger))).body).toEqual(
        [],
      );
    });
  });

  describe('disputes', () => {
    let disputeId: string;

    it('requires the order to have shipped', async () => {
      await setStatus(SELLER_ORDER_B, 'paid');
      await http()
        .post('/disputes')
        .set(as(buyer))
        .send({
          sellerOrderId: SELLER_ORDER_B,
          reason: 'not_received',
          description: 'Nunca llegó el paquete',
        })
        .expect(400);
    });

    it('opens a case capped at what can still be refunded, one at a time', async () => {
      await setStatus(SELLER_ORDER_A, 'delivered');
      const res = await http()
        .post('/disputes')
        .set(as(buyer))
        .send({
          sellerOrderId: SELLER_ORDER_A,
          reason: 'damaged',
          description: 'Llegó roto en una esquina',
          amount: 99_000_000,
        })
        .expect(201);
      disputeId = res.body.id;
      expect(res.body).toMatchObject({
        status: 'open',
        requestedAmount: 20_000_000,
        maxAmount: 20_000_000,
        viewerRole: 'buyer',
      });
      expect(await events('dispute.opened')).toHaveLength(1);
      await http()
        .post('/disputes')
        .set(as(buyer))
        .send({ sellerOrderId: SELLER_ORDER_A, reason: 'damaged', description: 'Otro intento más' })
        .expect(409);
    });

    it('lets both parties talk, but not strangers', async () => {
      await http()
        .post(`/disputes/${disputeId}/messages`)
        .set(as(seller))
        .send({ text: '¿Nos envías una foto?' })
        .expect(200);
      const stranger = await token('0f3a5c1e-8888-4a1b-8c1d-000000000008');
      await http().get(`/disputes/${disputeId}`).set(as(stranger)).expect(403);
      const detail = await http().get(`/disputes/${disputeId}`).set(as(buyer)).expect(200);
      expect(detail.body.messages.map((m: { authorRole: string }) => m.authorRole)).toEqual([
        'buyer',
        'seller',
      ]);
    });

    it('goes to an admin after the seller rejects, and the decision triggers the refund', async () => {
      await http()
        .post(`/disputes/${disputeId}/respond`)
        .set(as(seller))
        .send({ action: 'reject', text: 'Salió en perfecto estado' })
        .expect(200);
      await http()
        .post(`/admin/disputes/${disputeId}/resolve`)
        .set(as(buyer))
        .send({ resolution: 'refund' })
        .expect(403);
      await http().post(`/disputes/${disputeId}/escalate`).set(as(buyer)).expect(200);
      const resolved = await http()
        .post(`/admin/disputes/${disputeId}/resolve`)
        .set(as(admin))
        .send({ resolution: 'partial_refund', amount: 5_000_000 })
        .expect(200);
      expect(resolved.body).toMatchObject({
        status: 'resolved',
        resolution: 'partial_refund',
        refundAmount: 5_000_000,
      });
      expect(await events('dispute.resolved')).toEqual([
        {
          disputeId,
          orderId: ORDER_ID,
          sellerOrderId: SELLER_ORDER_A,
          resolution: 'partial_refund',
          refundAmount: 5_000_000,
          currency: 'COP',
        },
      ]);
      await http()
        .post(`/disputes/${disputeId}/messages`)
        .set(as(buyer))
        .send({ text: 'gracias' })
        .expect(400);
    });

    it('resolves immediately when the seller accepts', async () => {
      const res = await http()
        .post('/disputes')
        .set(as(buyer))
        .send({
          sellerOrderId: SELLER_ORDER_A,
          reason: 'return',
          description: 'Quiero devolverlo, no me quedó',
          amount: 3_000_000,
        })
        .expect(201);
      const accepted = await http()
        .post(`/disputes/${res.body.id}/respond`)
        .set(as(seller))
        .send({ action: 'accept' })
        .expect(200);
      expect(accepted.body).toMatchObject({
        status: 'resolved',
        resolution: 'partial_refund',
        refundAmount: 3_000_000,
      });
    });

    it('escalates cases the seller never answers', async () => {
      const res = await http()
        .post('/disputes')
        .set(as(buyer))
        .send({
          sellerOrderId: SELLER_ORDER_A,
          reason: 'wrong_item',
          description: 'Me llegó otro producto',
        })
        .expect(201);
      await db.query(
        `UPDATE disputes SET seller_deadline = now() - interval '1 minute' WHERE id = $1`,
        [res.body.id],
      );
      expect(await disputes.escalateOverdue()).toBe(1);
      expect((await http().get(`/disputes/${res.body.id}`).set(as(buyer))).body.status).toBe(
        'escalated',
      );
    });
  });
});
