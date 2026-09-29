import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import pg from 'pg';
import { JWT_AUDIENCE, JWT_ISSUER, type Role } from '@mercadia/contracts';

const base = process.env.TEST_DATABASE_URL ?? 'postgres://mercadia:mercadia@localhost:5433';
process.env.FULFILLMENT_DATABASE_URL = `${base}/fulfillment_test`;
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/9';
process.env.CONSUME_EVENTS = 'false';
process.env.LOG_LEVEL = 'silent';

/** Fake identity (JWKS) and fake orders service on random ports. */
const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'RS256', use: 'sig' };

export const ORDER_ID = '9b0e0d1a-1111-4c1d-8a1b-000000000001';
export const BUYER = '0f3a5c1e-1111-4a1b-8c1d-000000000001';
export const SELLER_ORDER_A = '9b0e0d1a-aaaa-4c1d-8a1b-00000000000a';
export const SELLER_ORDER_B = '9b0e0d1a-bbbb-4c1d-8a1b-00000000000b';
export const STORE_A = '11111111-1111-4111-8111-111111111111';
export const orderState = { status: 'pending_payment', refunded: 0 };

const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/jwks.json') return res.end(JSON.stringify({ keys: [jwk] }));
  if (req.url?.startsWith('/internal/orders/')) {
    const id = req.url.split('/').pop();
    if (id !== ORDER_ID) {
      res.statusCode = 404;
      return res.end('{}');
    }
    return res.end(
      JSON.stringify({
        id: ORDER_ID,
        number: 5001,
        buyerId: BUYER,
        buyerEmail: 'b@example.com',
        status: orderState.status,
        currency: 'COP',
        fxRate: 4000,
        total: 30_000_000,
        paymentDeadline: new Date().toISOString(),
        shippingAddress: {
          fullName: 'Laura',
          phone: '3001234567',
          line1: 'Calle 1',
          city: 'Cali',
          department: 'Valle del Cauca',
          country: 'CO',
        },
        sellers: [
          {
            sellerOrderId: SELLER_ORDER_A,
            storeId: STORE_A,
            storeName: 'Urbano',
            total: 20_000_000,
            commission: 1_600_000,
            refunded: 0,
            status: 'pending_payment',
          },
          {
            sellerOrderId: SELLER_ORDER_B,
            storeId: '22222222-2222-4222-8222-222222222222',
            storeName: 'Casa',
            total: 10_000_000,
            commission: 800_000,
            refunded: 0,
            status: 'pending_payment',
          },
        ],
      }),
    );
  }
  res.statusCode = 404;
  res.end('{}');
}).listen(0);
await new Promise((r) => server.once('listening', r));
const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
process.env.JWKS_URL = `${url}/jwks.json`;
process.env.FULFILLMENT_ORDERS_URL = url;

export function token(sub: string, roles: Role[] = ['buyer'], storeId?: string) {
  return new SignJWT({
    email: `${sub.slice(0, 4)}@example.com`,
    name: 'Test Buyer',
    roles,
    ...(storeId && { storeId }),
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setSubject(sub)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime('10m')
    .sign(privateKey);
}

export async function resetDatabase() {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS fulfillment_test WITH (FORCE)');
  await admin.query('CREATE DATABASE fulfillment_test');
  await admin.end();
}
