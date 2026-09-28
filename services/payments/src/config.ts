import { optionalServiceEnv, serviceEnv } from '@mercadia/service-kit';

const S = 'payments';

export const config = () => ({
  port: Number(serviceEnv(S, 'PORT', '4004')),
  databaseUrl: serviceEnv(
    S,
    'DATABASE_URL',
    'postgres://mercadia:mercadia@localhost:5433/payments',
  ),
  redisUrl: serviceEnv(S, 'REDIS_URL', 'redis://localhost:6379'),
  internalKey: serviceEnv(S, 'INTERNAL_API_KEY', 'dev-internal-key'),
  jwksUrl: serviceEnv(S, 'JWKS_URL', 'http://localhost:4001/.well-known/jwks.json'),
  ordersUrl: serviceEnv(S, 'ORDERS_URL', 'http://localhost:4003'),
  /** Test-mode keys. Without them the service uses the simulated processor. */
  stripeSecretKey: optionalServiceEnv(S, 'STRIPE_SECRET_KEY'),
  stripePublishableKey: optionalServiceEnv(S, 'STRIPE_PUBLISHABLE_KEY'),
  stripeWebhookSecret: optionalServiceEnv(S, 'STRIPE_WEBHOOK_SECRET'),
  siteUrl: serviceEnv(S, 'SITE_URL', 'http://localhost:3000'),
  seed: serviceEnv(S, 'SEED_DEMO_DATA', 'true') === 'true',
  consumeEvents: serviceEnv(S, 'CONSUME_EVENTS', 'true') === 'true',
});

export type PaymentsConfig = ReturnType<typeof config>;
export const CONFIG = Symbol('PAYMENTS_CONFIG');
