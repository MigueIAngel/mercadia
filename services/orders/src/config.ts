import { serviceEnv } from '@mercadia/service-kit';

const S = 'orders';

export const config = () => ({
  port: Number(serviceEnv(S, 'PORT', '4003')),
  databaseUrl: serviceEnv(S, 'DATABASE_URL', 'postgres://mercadia:mercadia@localhost:5433/orders'),
  redisUrl: serviceEnv(S, 'REDIS_URL', 'redis://localhost:6379'),
  internalKey: serviceEnv(S, 'INTERNAL_API_KEY', 'dev-internal-key'),
  jwksUrl: serviceEnv(S, 'JWKS_URL', 'http://localhost:4001/.well-known/jwks.json'),
  catalogUrl: serviceEnv(S, 'CATALOG_URL', 'http://localhost:4002'),
  fulfillmentUrl: serviceEnv(S, 'FULFILLMENT_URL', 'http://localhost:4005'),
  /** Marketplace commission on each seller's subtotal. */
  commissionRate: Number(serviceEnv(S, 'COMMISSION_RATE', '0.08')),
  /** Unpaid orders are cancelled (and their stock released) after this many minutes. */
  paymentWindowMinutes: Number(serviceEnv(S, 'PAYMENT_WINDOW_MINUTES', '30')),
  seed: serviceEnv(S, 'SEED_DEMO_DATA', 'true') === 'true',
  consumeEvents: serviceEnv(S, 'CONSUME_EVENTS', 'true') === 'true',
});

export type OrdersConfig = ReturnType<typeof config>;
export const CONFIG = Symbol('ORDERS_CONFIG');
