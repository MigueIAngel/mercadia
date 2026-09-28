import type { NextFunction, Request, Response } from 'express';
import client from 'prom-client';

const registry = new client.Registry();
let initialised = false;

const httpDuration = new client.Histogram({
  name: 'http_server_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['service', 'method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

export function metricsRegistry(): client.Registry {
  if (!initialised) {
    client.collectDefaultMetrics({ register: registry });
    initialised = true;
  }
  return registry;
}

/** Records one histogram sample per request, labelled by the matched route. */
export function metricsMiddleware(service: string) {
  metricsRegistry();
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/metrics') {
      res.setHeader('Content-Type', registry.contentType);
      void registry.metrics().then((body) => res.end(body));
      return;
    }
    const end = httpDuration.startTimer();
    res.on('finish', () => {
      const route = (req.route?.path as string | undefined) ?? 'unmatched';
      end({ service, method: req.method, route, status: String(res.statusCode) });
    });
    next();
  };
}
