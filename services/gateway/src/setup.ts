import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HealthRegistry, metricsMiddleware } from '@mercadia/service-kit';
import { CONFIG, SERVICES, type GatewayConfig } from './config.js';
import { ServiceRegistry } from './resilience/registry.js';
import { createProxies } from './routing/proxy.js';
import { RateLimiter } from './security/rate-limiter.js';

/** Order matters: metrics → CORS → rate limit → proxies → the gateway's own routes. */
export function configureGateway(app: INestApplication) {
  const config = app.get<GatewayConfig>(CONFIG);
  app.get(HealthRegistry).service = 'gateway';
  app.use(metricsMiddleware('gateway'));
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    exposedHeaders: ['x-request-id', 'Retry-After'],
  });
  app.use(app.get(RateLimiter).middleware());
  const proxies = createProxies(app.get(ServiceRegistry));
  app.use(proxies.middleware);
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Mercadia · API gateway')
      .setDescription(
        'Single entry point. Pick a service in the selector (top right) to browse its API.',
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'openapi.json',
    explorer: true,
    swaggerOptions: {
      urls: [
        { url: '/openapi.json', name: 'gateway' },
        ...SERVICES.map((s) => ({ url: `/api/docs/${s}/openapi.json`, name: s })),
      ],
      persistAuthorization: true,
    },
  });
  return {
    /** Forward WebSocket upgrades (realtime chat and notifications) to engagement. */
    attachWebsockets(server: Server) {
      server.on('upgrade', (req, socket, head) => {
        if (req.url?.startsWith('/api/realtime'))
          proxies.websocket.upgrade(req as never, socket as never, head);
        else socket.destroy();
      });
    },
  };
}
