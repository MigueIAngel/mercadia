import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { BUYER, ORDER_ID, resetDatabase, token } from './setup-env.js';

describe('Saved payment methods (e2e)', () => {
  let app: INestApplication;
  let buyer: string;
  let other: string;
  const http = () => request(app.getHttpServer());
  const card = (number: string, expMonth = 12) => ({ number, expMonth, expYear: 2031, cvc: '123' });
  const save = (auth: string, body: object) =>
    http().post('/payments/methods/test-card').set('Authorization', `Bearer ${auth}`).send(body);
  const list = async (auth = buyer) =>
    (await http().get('/payments/methods').set('Authorization', `Bearer ${auth}`).expect(200))
      .body as { id: string; last4: string; isDefault: boolean }[];

  beforeAll(async () => {
    await resetDatabase();
    process.env.SEED_DEMO_DATA = 'false';
    const { AppModule } = await import('../src/app.module.js');
    const { configureService } = await import('@mercadia/service-kit');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureService(app, { name: 'payments', port: 0, title: 'Payments', description: '' });
    await app.init();
    buyer = await token(BUYER);
    other = await token('0f3a5c1e-9999-4a1b-8c1d-000000000009');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('validates cards like a processor and never stores declined ones', async () => {
    const declined = await save(buyer, card('4000 0000 0000 0002')).expect(400);
    expect(declined.body.message).toBe('card_declined');
    await save(buyer, card('4242 4242 4242 4241')).expect(400);
    expect(await list()).toEqual([]);
  });

  it('makes the first card the default and keeps duplicates once', async () => {
    const visa = await save(buyer, card('4242 4242 4242 4242')).expect(201);
    expect(visa.body).toMatchObject({ brand: 'visa', last4: '4242', isDefault: true });
    expect(JSON.stringify(visa.body)).not.toContain('4242424242424242');
    await save(buyer, card('5555 5555 5555 4444')).expect(201);
    await save(buyer, card('5555 5555 5555 4444')).expect(201);
    const cards = await list();
    expect(cards.map((c) => [c.last4, c.isDefault])).toEqual([
      ['4242', true],
      ['4444', false],
    ]);
    expect(await list(other)).toEqual([]);
  });

  it('switches the default card and promotes another one when it is removed', async () => {
    const [visa, mastercard] = await list();
    const after = await http()
      .post(`/payments/methods/${mastercard.id}/default`)
      .set('Authorization', `Bearer ${buyer}`)
      .expect(200);
    expect(after.body[0]).toMatchObject({ id: mastercard.id, isDefault: true });
    await http()
      .delete(`/payments/methods/${mastercard.id}`)
      .set('Authorization', `Bearer ${other}`)
      .expect(404);
    await http()
      .delete(`/payments/methods/${mastercard.id}`)
      .set('Authorization', `Bearer ${buyer}`)
      .expect(204);
    expect(await list()).toEqual([expect.objectContaining({ id: visa.id, isDefault: true })]);
  });

  it('pays an order with a saved card', async () => {
    const [visa] = await list();
    const intent = await http()
      .post('/payments/intents')
      .set('Authorization', `Bearer ${buyer}`)
      .send({ orderId: ORDER_ID })
      .expect(201);
    const paid = await http()
      .post(`/payments/${intent.body.id}/pay-saved`)
      .set('Authorization', `Bearer ${buyer}`)
      .send({ methodId: visa.id })
      .expect(200);
    expect(paid.body).toMatchObject({
      status: 'succeeded',
      card: { brand: 'visa', last4: '4242' },
      nextActionClientSecret: null,
    });
    await http()
      .post(`/payments/${intent.body.id}/pay-saved`)
      .set('Authorization', `Bearer ${buyer}`)
      .send({ methodId: visa.id })
      .expect(409);
  });
});
