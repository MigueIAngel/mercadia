import { optionalServiceEnv, serviceEnv } from '@mercadia/service-kit';

const S = 'identity';

/** All settings in one place; `IDENTITY_<KEY>` overrides `<KEY>` (see service-kit). */
export const config = () => ({
  port: Number(serviceEnv(S, 'PORT', '4001')),
  databaseUrl: serviceEnv(
    S,
    'DATABASE_URL',
    'postgres://mercadia:mercadia@localhost:5433/identity',
  ),
  redisUrl: serviceEnv(S, 'REDIS_URL', 'redis://localhost:6379'),
  internalKey: serviceEnv(S, 'INTERNAL_API_KEY', 'dev-internal-key'),
  /** PEM (or base64 of it). Generated and kept in memory in development if missing. */
  jwtPrivateKey: optionalServiceEnv(S, 'JWT_PRIVATE_KEY'),
  /** 32-byte key (hex or base64) that encrypts TOTP secrets at rest. */
  encryptionKey: serviceEnv(S, 'ENCRYPTION_KEY', 'dev-only-encryption-key-change-me'),
  accessTtlSeconds: Number(serviceEnv(S, 'ACCESS_TOKEN_TTL', '900')),
  refreshTtlDays: Number(serviceEnv(S, 'REFRESH_TOKEN_TTL_DAYS', '30')),
  googleClientId: optionalServiceEnv(S, 'GOOGLE_CLIENT_ID'),
  googleClientSecret: optionalServiceEnv(S, 'GOOGLE_CLIENT_SECRET'),
  demoLogin: serviceEnv(S, 'DEMO_LOGIN', 'true') === 'true',
  seed: serviceEnv(S, 'SEED_DEMO_DATA', 'true') === 'true',
  consumeEvents: serviceEnv(S, 'CONSUME_EVENTS', 'true') === 'true',
});

export type IdentityConfig = ReturnType<typeof config>;
export const CONFIG = Symbol('IDENTITY_CONFIG');
