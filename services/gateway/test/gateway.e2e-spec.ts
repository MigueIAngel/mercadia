import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Redis } from 'ioredis';
import request from 'supertest';

async function upstream(
  handler: (url: string, body: string, headers: Record<string, unknown>) => [number, unknown],
) {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const [status, payload] = handler(req.url ?? '', body, req.headers);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

describe('Gateway (e2e)', () => {
  let app: INestApplication;
  let servers: Server[] = [];
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const catalog = await upstream((url, body, headers) =>
      url === '/health'
        ? [200, { status: 'up' }]
        : [200, { url, body, auth: headers.authorization ?? null }],
    );
    const identity = await upstream((url) =>
      url === '/health' ? [200, { status: 'up' }] : [200, { url }],
    );
    servers = [catalog.server, identity.server];
    process.env.GATEWAY_CATALOG_URL = catalog.url;
    process.env.GATEWAY_IDENTITY_URL = identity.url;
    process.env.GATEWAY_ORDERS_URL = 'http://127.0.0.1:1';
    process.env.BREAKER_THRESHOLD = '2';
    process.env.RATE_LIMIT_AUTH = '3';
    process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/12';
    process.env.LOG_LEVEL = 'silent';
    await new Redis(process.env.REDIS_URL).flushdb();

    const { AppModule } = await import('../src/app.module.js');
    const { configureGateway } = await import('../src/setup.js');
    app = await NestFactory.create(AppModule, { bodyParser: false, logger: false });
    configureGateway(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    servers.forEach((s) => s.close());
  });

  it('forwards /api/<resource> to the owning service without the prefix', async () => {
    const res = await http().get('/api/products?q=phone').expect(200);
    expect(res.body.url).toBe('/products?q=phone');
  });

  it('streams bodies and forwards the Authorization header', async () => {
    const res = await http()
      .post('/api/seller/products')
      .set('Authorization', 'Bearer abc')
      .send({ title: 'x' })
      .expect(200);
    expect(JSON.parse(res.body.body)).toEqual({ title: 'x' });
    expect(res.body.auth).toBe('Bearer abc');
  });

  it('never exposes internal endpoints', async () => {
    await http().post('/api/internal/quote').expect(404);
    await http().post('/api/users/internal/lookup').expect(404);
  });

  it('fails fast with 503 once a service circuit opens', async () => {
    await http().get('/api/orders').expect(503);
    await http().get('/api/orders').expect(503);
    const res = await http().get('/api/orders').expect(503);
    expect(res.body.reason).toBe('circuit_open');
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('rate-limits sign-in attempts per client', async () => {
    for (let i = 0; i < 3; i++) {
      await http().post('/api/auth/login').set('x-client-ip', '9.9.9.9').send({}).expect(200);
    }
    await http().post('/api/auth/login').set('x-client-ip', '9.9.9.9').send({}).expect(429);
    await http().post('/api/auth/login').set('x-client-ip', '8.8.8.8').send({}).expect(200);
  });

  it('aggregates health', async () => {
    const res = await http().get('/api/health').expect(200);
    expect(res.body.services.catalog.status).toBe('up');
    expect(res.body.services.orders.status).toBe('down');
    expect(res.body.status).toBe('degraded');
  });

  it('degrades the composed home page instead of failing', async () => {
    const res = await http().get('/api/storefront/home').expect(200);
    expect(res.body).toHaveProperty('categories');
  });
});
