import { serviceEnv } from '@mercadia/service-kit';

const S = 'fulfillment';

export const config = () => ({
  port: Number(serviceEnv(S, 'PORT', '4005')),
  databaseUrl: serviceEnv(
    S,
    'DATABASE_URL',
    'postgres://mercadia:mercadia@localhost:5433/fulfillment',
  ),
  redisUrl: serviceEnv(S, 'REDIS_URL', 'redis://localhost:6379'),
  internalKey: serviceEnv(S, 'INTERNAL_API_KEY', 'dev-internal-key'),
  jwksUrl: serviceEnv(S, 'JWKS_URL', 'http://localhost:4001/.well-known/jwks.json'),
  ordersUrl: serviceEnv(S, 'ORDERS_URL', 'http://localhost:4003'),
  /** Simulated carrier: seconds between tracking updates (short, so the demo moves). */
  trackingStepSeconds: Number(serviceEnv(S, 'TRACKING_STEP_SECONDS', '90')),
  /** Sellers must answer a dispute within this many hours or it goes to an admin. */
  sellerResponseHours: Number(serviceEnv(S, 'SELLER_RESPONSE_HOURS', '72')),
  seed: serviceEnv(S, 'SEED_DEMO_DATA', 'true') === 'true',
  consumeEvents: serviceEnv(S, 'CONSUME_EVENTS', 'true') === 'true',
});

export type FulfillmentConfig = ReturnType<typeof config>;
export const CONFIG = Symbol('FULFILLMENT_CONFIG');
