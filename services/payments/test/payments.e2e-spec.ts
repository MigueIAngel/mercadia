import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import {
  BUYER,
  ORDER_ID,
  orderState,
  resetDatabase,
  SELLER_ORDER_A,
  SELLER_ORDER_B,
  STORE_A,
  token,
} from './setup-env.js';

describe('Payments service (e2e)', () => {
  let app: INestApplication;
  let db: pg.Client;
  let buyer: string;
  let service: import('../src/payments/payments.service.js').PaymentsService;
  const http = () => request(app.getHttpServer());
  const card = (number: string) => ({ number, expMonth: 12, expYear: 2031, cvc: '123' });
  const events = async (type: string) =>
    (
      await db.query(
        `SELECT payload->'data' AS data FROM outbox WHERE payload->>'type' = $1 ORDER BY id`,
        [type],
      )
    ).rows.map((r) => r.data);

  beforeAll(async () => {
    await resetDatabase();
    process.env.SEED_DEMO_DATA = 'false';
    const { AppModule } = await import('../src/app.module.js');
    const { configureService } = await import('@mercadia/service-kit');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureService(app, { name: 'payments', port: 0, title: 'Payments', description: '' });
    await app.init();
    service = app.get((await import('../src/payments/payments.service.js')).PaymentsService);
    db = new pg.Client({ connectionString: process.env.PAYMENTS_DATABASE_URL });
    await db.connect();
    buyer = await token(BUYER);
  });

  afterAll(async () => {
    await db?.end();
    await app?.close();
  });

  it('only lets the buyer pay their own order', async () => {
    const other = await token('0f3a5c1e-9999-4a1b-8c1d-000000000009');
    await http()
      .post('/payments/intents')
      .set('Authorization', `Bearer ${other}`)
      .send({ orderId: ORDER_ID })
      .expect(403);
  });

  it('declines, then accepts a retry, holding each seller share in escrow', async () => {
    const intent = await http()
      .post('/payments/intents')
      .set('Authorization', `Bearer ${buyer}`)
      .send({ orderId: ORDER_ID })
      .expect(201);
    expect(intent.body).toMatchObject({
      provider: 'mock',
      status: 'requires_payment',
      amount: 30_000_000,
    });

    const declined = await http()
      .post(`/payments/${intent.body.id}/confirm-test`)
      .set('Authorization', `Bearer ${buyer}`)
      .send(card('4000000000000002'))
      .expect(200);
    expect(declined.body).toMatchObject({ status: 'failed', failureReason: 'card_declined' });
    expect(await events('payment.failed')).toHaveLength(1);

    const retry = await http()
      .post('/payments/intents')
      .set('Authorization', `Bearer ${buyer}`)
      .send({ orderId: ORDER_ID })
      .expect(201);
    const paid = await http()
      .post(`/payments/${retry.body.id}/confirm-test`)
      .set('Authorization', `Bearer ${buyer}`)
      .send(card('4242 4242 4242 4242'))
      .expect(200);
    expect(paid.body).toMatchObject({
      status: 'succeeded',
      card: { brand: 'visa', last4: '4242' },
    });
    expect(await events('payment.succeeded')).toHaveLength(1);

    const { rows } = await db.query(
      'SELECT seller_order_id, amount, commission, status FROM transfers ORDER BY gross DESC',
    );
    expect(rows).toEqual([
      {
        seller_order_id: SELLER_ORDER_A,
        amount: 18_400_000,
        commission: 1_600_000,
        status: 'held',
      },
      { seller_order_id: SELLER_ORDER_B, amount: 9_200_000, commission: 800_000, status: 'held' },
    ]);
  });

  it('does not charge twice', async () => {
    const payment = await http()
      .get(`/payments/orders/${ORDER_ID}`)
      .set('Authorization', `Bearer ${buyer}`)
      .expect(200);
    await http()
      .post(`/payments/${payment.body.id}/confirm-test`)
      .set('Authorization', `Bearer ${buyer}`)
      .send(card('4242424242424242'))
      .expect(409);
  });

  it("releases a seller's money only when their shipment is delivered", async () => {
    await service.release(SELLER_ORDER_A);
    const { rows } = await db.query(
      `SELECT seller_order_id, status FROM transfers ORDER BY gross DESC`,
    );
    expect(rows.map((r) => r.status)).toEqual(['released', 'held']);
    const seller = await token(
      '0f3a5c1e-4444-4a1b-8c1d-000000000004',
      ['buyer', 'seller'],
      STORE_A,
    );
    const payouts = await http()
      .get('/seller/payouts')
      .set('Authorization', `Bearer ${seller}`)
      .expect(200);
    expect(payouts.body.totals).toMatchObject({ released: 18_400_000, held: 0 });
  });

  it('refunds a resolved dispute once and takes it from the held share', async () => {
    const dispute = {
      disputeId: 'd-1',
      orderId: ORDER_ID,
      sellerOrderId: SELLER_ORDER_B,
      resolution: 'partial_refund' as const,
      refundAmount: 2_000_000,
      currency: 'COP' as const,
    };
    await service.onDisputeResolved(dispute);
    await service.onDisputeResolved(dispute);
    expect(await events('refund.succeeded')).toEqual([
      { orderId: ORDER_ID, sellerOrderId: SELLER_ORDER_B, amount: 2_000_000, currency: 'COP' },
    ]);
    const { rows } = await db.query(`SELECT amount FROM transfers WHERE seller_order_id = $1`, [
      SELLER_ORDER_B,
    ]);
    expect(rows[0].amount).toBe(7_200_000);
    const payment = await http()
      .get(`/payments/orders/${ORDER_ID}`)
      .set('Authorization', `Bearer ${buyer}`);
    expect(payment.body).toMatchObject({ status: 'partially_refunded', refunded: 2_000_000 });
  });

  it('ignores rejected disputes', async () => {
    await service.onDisputeResolved({
      disputeId: 'd-2',
      orderId: ORDER_ID,
      sellerOrderId: SELLER_ORDER_A,
      resolution: 'rejected',
      refundAmount: 0,
      currency: 'COP',
    });
    expect(await events('refund.succeeded')).toHaveLength(1);
  });

  it('refunds what is left when a paid order gets cancelled', async () => {
    orderState.status = 'cancelled';
    await service.onOrderCancelled(ORDER_ID);
    const payment = await http()
      .get(`/payments/orders/${ORDER_ID}`)
      .set('Authorization', `Bearer ${buyer}`);
    expect(payment.body.status).toBe('refunded');
    expect(payment.body.refunded).toBe(30_000_000);
  });

  it('enables payouts for sellers in simulated mode', async () => {
    const seller = await token(
      '0f3a5c1e-4444-4a1b-8c1d-000000000004',
      ['buyer', 'seller'],
      STORE_A,
    );
    const res = await http()
      .post('/seller/payouts/onboarding')
      .set('Authorization', `Bearer ${seller}`)
      .expect(200);
    expect(res.body).toEqual({ url: null, payoutsEnabled: true });
    expect(await events('store.payouts_enabled')).toHaveLength(0); // published directly, not via outbox
  });

  it('rejects Stripe webhooks when Stripe is not configured', async () => {
    await http().post('/webhooks/stripe').set('stripe-signature', 'x').send({}).expect(400);
  });
});
