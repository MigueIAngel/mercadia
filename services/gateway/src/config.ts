import { serviceEnv } from '@mercadia/service-kit';

const S = 'gateway';

export const SERVICES = [
  'identity',
  'catalog',
  'orders',
  'payments',
  'fulfillment',
  'engagement',
  'ai',
] as const;
export type ServiceName = (typeof SERVICES)[number];

const DEFAULT_PORTS: Record<ServiceName, number> = {
  identity: 4001,
  catalog: 4002,
  orders: 4003,
  payments: 4004,
  fulfillment: 4005,
  engagement: 4006,
  ai: 8000,
};

export const config = () => ({
  port: Number(serviceEnv(S, 'PORT', '4000')),
  redisUrl: serviceEnv(S, 'REDIS_URL', 'redis://localhost:6379'),
  /** Unlocks `/api/_svc/*` for services hosted in other containers (e.g. the AI service). */
  internalKey: serviceEnv(S, 'INTERNAL_API_KEY', 'dev-internal-key'),
  corsOrigins: serviceEnv(S, 'CORS_ORIGINS', 'http://localhost:3000').split(','),
  breakerThreshold: Number(serviceEnv(S, 'BREAKER_THRESHOLD', '5')),
  breakerCooldownMs: Number(serviceEnv(S, 'BREAKER_COOLDOWN_MS', '10000')),
  rateLimits: {
    auth: Number(serviceEnv(S, 'RATE_LIMIT_AUTH', '20')),
    write: Number(serviceEnv(S, 'RATE_LIMIT_WRITE', '120')),
    read: Number(serviceEnv(S, 'RATE_LIMIT_READ', '600')),
  },
  urls: Object.fromEntries(
    SERVICES.map((name) => [
      name,
      serviceEnv(S, `${name.toUpperCase()}_URL`, `http://localhost:${DEFAULT_PORTS[name]}`).replace(
        /\/$/,
        '',
      ),
    ]),
  ) as Record<ServiceName, string>,
});

export type GatewayConfig = ReturnType<typeof config>;
export const CONFIG = Symbol('GATEWAY_CONFIG');
