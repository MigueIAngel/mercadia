import { optionalServiceEnv, serviceEnv } from '@mercadia/service-kit';

const S = 'catalog';

export const config = () => ({
  port: Number(serviceEnv(S, 'PORT', '4002')),
  mongoUri: serviceEnv(S, 'MONGODB_URI', 'mongodb://localhost:27017/?directConnection=true'),
  mongoDb: serviceEnv(S, 'MONGODB_DB', 'catalog'),
  redisUrl: serviceEnv(S, 'REDIS_URL', 'redis://localhost:6379'),
  internalKey: serviceEnv(S, 'INTERNAL_API_KEY', 'dev-internal-key'),
  jwksUrl: serviceEnv(S, 'JWKS_URL', 'http://localhost:4001/.well-known/jwks.json'),
  cloudinaryUrl: optionalServiceEnv(S, 'CLOUDINARY_URL'),
  /** Fallback when the free FX API is unreachable. */
  usdToCop: Number(serviceEnv(S, 'FX_USD_COP', '4100')),
  fetchRates: serviceEnv(S, 'FETCH_FX_RATES', 'true') === 'true',
  /** Unpaid checkouts give their stock back after this many minutes. */
  reservationMinutes: Number(serviceEnv(S, 'RESERVATION_MINUTES', '30')),
  seed: serviceEnv(S, 'SEED_DEMO_DATA', 'true') === 'true',
  consumeEvents: serviceEnv(S, 'CONSUME_EVENTS', 'true') === 'true',
  useAtlasSearch: serviceEnv(S, 'ATLAS_SEARCH', 'true') === 'true',
});

export type CatalogConfig = ReturnType<typeof config>;
export const CONFIG = Symbol('CATALOG_CONFIG');
