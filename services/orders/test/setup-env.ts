import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import pg from 'pg';
import { JWT_AUDIENCE, JWT_ISSUER, type Role } from '@mercadia/contracts';

const base = process.env.TEST_DATABASE_URL ?? 'postgres://mercadia:mercadia@localhost:5433';
process.env.ORDERS_DATABASE_URL = `${base}/orders_test`;
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/11';
process.env.CONSUME_EVENTS = 'false';
process.env.LOG_LEVEL = 'silent';

/** Fake identity (JWKS) and fake catalog (prices, stock, FX) on random ports. */
const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'RS256', use: 'sig' };

export const catalogStock = new Map<string, number>([
  ['SHIRT-M', 10],
  ['LAMP-1', 3],
  ['RICE-1', 50],
]);
const PRODUCTS: Record<
  string,
  {
    productId: string;
    title: string;
    storeId: string;
    storeName: string;
    category: string;
    priceUsd: number;
  }
> = {
  'SHIRT-M': {
    productId: 'p-shirt',
    title: 'Shirt',
    storeId: '11111111-1111-4111-8111-111111111111',
    storeName: 'Urbano',
    category: 'fashion',
    priceUsd: 2500,
  },
  'LAMP-1': {
    productId: 'p-lamp',
    title: 'Lamp',
    storeId: '22222222-2222-4222-8222-222222222222',
    storeName: 'Casa',
    category: 'home',
    priceUsd: 1000,
  },
  'RICE-1': {
    productId: 'p-rice',
    title: 'Rice',
    storeId: '22222222-2222-4222-8222-222222222222',
    storeName: 'Casa',
    category: 'groceries',
    priceUsd: 300,
  },
};

const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/jwks.json') return res.end(JSON.stringify({ keys: [jwk] }));
    if (req.url === '/currency/rates')
      return res.end(JSON.stringify({ rates: { USD: 1, COP: 4000 } }));
    if (req.url === '/internal/quote') {
      const { items } = JSON.parse(body) as {
        items: { productId: string; sku: string; quantity: number }[];
      };
      return res.end(
        JSON.stringify(
          items.map((i) => {
            const p = PRODUCTS[i.sku];
            if (!p) return { ...i, available: false, reason: 'not_found' };
            const stock = catalogStock.get(i.sku) ?? 0;
            return {
              ...i,
              available: stock >= i.quantity,
              reason: stock >= i.quantity ? null : 'insufficient_stock',
              stock,
              title: p.title,
              image: null,
              options: {},
              storeId: p.storeId,
              storeName: p.storeName,
              category: p.category,
              unitPriceUsd: p.priceUsd,
              weightGrams: 500,
            };
          }),
        ),
      );
    }
    res.statusCode = 404;
    res.end('{}');
  });
}).listen(0);
await new Promise((r) => server.once('listening', r));
const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
process.env.JWKS_URL = `${url}/jwks.json`;
process.env.ORDERS_CATALOG_URL = url;
process.env.ORDERS_FULFILLMENT_URL = 'http://127.0.0.1:1';

export const STORE_A = PRODUCTS['SHIRT-M'].storeId;
export const STORE_B = PRODUCTS['LAMP-1'].storeId;

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
  await admin.query('DROP DATABASE IF EXISTS orders_test WITH (FORCE)');
  await admin.query('CREATE DATABASE orders_test');
  await admin.end();
}
