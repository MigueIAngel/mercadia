import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { createProxyMiddleware, type RequestHandler } from 'http-proxy-middleware';
import { SERVICES, type ServiceName } from '../config.js';
import type { ServiceRegistry } from '../resilience/registry.js';
import { isInternalPath, resolveRoute } from './routes.js';

const logger = new Logger('Proxy');

/** Paths answered by the gateway itself (composition endpoints). */
const GATEWAY_OWNED = [/^\/api\/storefront\//, /^\/api\/health$/, /^\/api\/docs\//];

function unavailable(
  res: ServerResponse,
  service: ServiceName,
  reason: string,
  retryAfterMs: number,
) {
  if (res.headersSent) return void res.end();
  const retry = Math.ceil(retryAfterMs / 1000);
  res.writeHead(503, {
    'Content-Type': 'application/json',
    ...(retry > 0 && { 'Retry-After': String(retry) }),
  });
  res.end(
    JSON.stringify({
      statusCode: 503,
      message: `The ${service} service is unavailable`,
      reason,
      service,
    }),
  );
}

/**
 * One proxy per service. `/api/<prefix>/...` → `<service>/<prefix>/...`, with the circuit
 * breaker in front, streaming bodies (no parsing) and WebSocket upgrades for realtime.
 */
export function createProxies(registry: ServiceRegistry, internalKey: string) {
  const expected = Buffer.from(internalKey);
  const validKey = (header: string | string[] | undefined) => {
    const given = Buffer.from(typeof header === 'string' ? header : '');
    return given.length === expected.length && timingSafeEqual(given, expected);
  };

  const proxies = Object.fromEntries(
    SERVICES.map((service) => {
      const breaker = registry.breakers[service];
      const proxy = createProxyMiddleware<Request, Response>({
        target: registry.url(service),
        changeOrigin: true,
        ws: service === 'engagement',
        pathRewrite: (path) => path.replace(/^\/api/, ''),
        proxyTimeout: service === 'ai' ? 60_000 : 15_000,
        on: {
          proxyRes: (proxyRes) => {
            if ((proxyRes.statusCode ?? 500) >= 500) breaker.failure();
            else breaker.success();
          },
          error: (error, _req, res) => {
            breaker.failure();
            logger.warn(`${service}: ${error.message}`);
            if ('writeHead' in res)
              unavailable(res, service, 'upstream_error', breaker.retryAfterMs());
          },
        },
      });
      return [service, proxy];
    }),
  ) as Record<ServiceName, RequestHandler<Request, Response>>;

  // Service-to-service calls between separately hosted containers (the free demo has no
  // private network): `/api/_svc/<service>/<path>` → `<service>/<path>`, internal key required.
  const direct = Object.fromEntries(
    SERVICES.map((service) => [
      service,
      createProxyMiddleware<Request, Response>({
        target: registry.url(service),
        changeOrigin: true,
        pathRewrite: (path) => path.replace(new RegExp(`^/api/_svc/${service}`), '') || '/',
        proxyTimeout: 30_000,
      }),
    ]),
  ) as Record<ServiceName, RequestHandler<Request, Response>>;

  const middleware = (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith('/api/') || GATEWAY_OWNED.some((re) => re.test(req.path)))
      return next();
    const svc = /^\/api\/_svc\/([a-z]+)(\/|$)/.exec(req.path);
    if (svc) {
      const service = svc[1] as ServiceName;
      if (!SERVICES.includes(service) || !validKey(req.headers['x-internal-key'])) {
        res.status(404).json({ statusCode: 404, message: 'Not found' });
        return;
      }
      return direct[service](req, res, next);
    }
    const path = req.path.slice('/api'.length);
    if (isInternalPath(path)) {
      res.status(404).json({ statusCode: 404, message: 'Not found' });
      return;
    }
    const route = resolveRoute(path);
    if (!route) return next();
    const breaker = registry.breakers[route.service];
    if (!breaker.canRequest())
      return unavailable(res, route.service, 'circuit_open', breaker.retryAfterMs());
    return proxies[route.service](req, res, next);
  };

  return { middleware, websocket: proxies.engagement };
}
