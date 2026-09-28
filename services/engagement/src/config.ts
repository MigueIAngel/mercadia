import { optionalServiceEnv, serviceEnv } from '@mercadia/service-kit';

const S = 'engagement';

export const config = () => ({
  port: Number(serviceEnv(S, 'PORT', '4006')),
  mongoUri: serviceEnv(S, 'MONGODB_URI', 'mongodb://localhost:27017/?directConnection=true'),
  mongoDb: serviceEnv(S, 'MONGODB_DB', 'engagement'),
  redisUrl: serviceEnv(S, 'REDIS_URL', 'redis://localhost:6379'),
  internalKey: serviceEnv(S, 'INTERNAL_API_KEY', 'dev-internal-key'),
  jwksUrl: serviceEnv(S, 'JWKS_URL', 'http://localhost:4001/.well-known/jwks.json'),
  identityUrl: serviceEnv(S, 'IDENTITY_URL', 'http://localhost:4001'),
  catalogUrl: serviceEnv(S, 'CATALOG_URL', 'http://localhost:4002'),
  ordersUrl: serviceEnv(S, 'ORDERS_URL', 'http://localhost:4003'),
  siteUrl: serviceEnv(S, 'SITE_URL', 'http://localhost:3000'),
  /** e.g. smtp://localhost:1025 (Mailpit). Without it emails are only logged. */
  smtpUrl: optionalServiceEnv(S, 'SMTP_URL'),
  mailFrom: serviceEnv(S, 'MAIL_FROM', 'Mercadia <no-reply@mercadia.dev>'),
  corsOrigins: serviceEnv(S, 'CORS_ORIGINS', 'http://localhost:3000').split(','),
  seed: serviceEnv(S, 'SEED_DEMO_DATA', 'true') === 'true',
  consumeEvents: serviceEnv(S, 'CONSUME_EVENTS', 'true') === 'true',
});

export type EngagementConfig = ReturnType<typeof config>;
export const CONFIG = Symbol('ENGAGEMENT_CONFIG');
