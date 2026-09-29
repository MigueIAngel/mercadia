import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { JWT_AUDIENCE, JWT_ISSUER, type Role } from '@mercadia/contracts';

process.env.ENGAGEMENT_MONGODB_DB = 'engagement_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/8';
process.env.CONSUME_EVENTS = 'false';
process.env.SEED_DEMO_DATA = 'false';
process.env.LOG_LEVEL = 'silent';

const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'RS256', use: 'sig' };

export const STORE = '11111111-1111-4111-8111-111111111111';
export const OWNER = '0f3a5c1e-4444-4a1b-8c1d-000000000004';
export const BUYER = '0f3a5c1e-1111-4a1b-8c1d-000000000001';
export const PRODUCT = 'p-lamp';
/** Buyers the fake orders service says received PRODUCT. */
export const purchasers = new Set<string>([BUYER]);
/** Current USD price (cents) the fake catalog reports for PRODUCT. */
export const catalogPriceUsd = { value: 5000 };

const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    const url = new URL(req.url!, 'http://x');
    if (url.pathname === '/jwks.json') return res.end(JSON.stringify({ keys: [jwk] }));
    if (url.pathname === '/products/by-ids') {
      const { ids, currency } = JSON.parse(body) as { ids: string[]; currency: string };
      return res.end(
        JSON.stringify(
          ids
            .filter((i) => i === PRODUCT)
            .map((id) => ({
              id,
              slug: 'lamp',
              title: 'Lámpara',
              image: null,
              price: currency === 'COP' ? catalogPriceUsd.value * 40 : catalogPriceUsd.value,
              currency,
              store: { id: STORE, name: 'Casa', slug: 'casa' },
            })),
        ),
      );
    }
    if (url.pathname === '/internal/purchases') {
      return res.end(
        JSON.stringify({
          purchased:
            purchasers.has(url.searchParams.get('buyerId')!) &&
            url.searchParams.get('productId') === PRODUCT,
        }),
      );
    }
    if (url.pathname.startsWith('/internal/orders/')) {
      return res.end(JSON.stringify({ number: 5001, buyerId: BUYER, sellers: [] }));
    }
    if (url.pathname === '/users/internal/lookup') return res.end('[]');
    res.statusCode = 404;
    res.end('{}');
  });
}).listen(0);
await new Promise((r) => server.once('listening', r));
const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
process.env.JWKS_URL = `${url}/jwks.json`;
process.env.ENGAGEMENT_CATALOG_URL = url;
process.env.ENGAGEMENT_ORDERS_URL = url;
process.env.ENGAGEMENT_IDENTITY_URL = url;

export function token(
  sub: string,
  roles: Role[] = ['buyer'],
  storeId?: string,
  name = 'Laura Gómez',
) {
  return new SignJWT({ email: 'x@example.com', name, roles, ...(storeId && { storeId }) })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setSubject(sub)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime('10m')
    .sign(privateKey);
}
