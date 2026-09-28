import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { HealthRegistry } from './health/health.js';
import { metricsMiddleware } from './metrics.js';

export interface ServiceOptions {
  name: string;
  port: number;
  title: string;
  description: string;
  /** Extra setup before listening (e.g. raw body for webhooks). */
  configure?: (app: NestExpressApplication) => void;
  rawBody?: boolean;
}

/** Applies the conventions every Mercadia service shares. */
export function configureService(app: INestApplication, options: ServiceOptions) {
  app.get(HealthRegistry).service = options.name;
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableShutdownHooks();
  app.use(metricsMiddleware(options.name));

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle(`Mercadia · ${options.title}`)
      .setDescription(options.description)
      .setVersion('1.0.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'openapi.json' });
}

export async function startService(module: unknown, options: ServiceOptions) {
  const app = await NestFactory.create<NestExpressApplication>(module as never, {
    bufferLogs: true,
    rawBody: options.rawBody,
  });
  app.useLogger(app.get(Logger));
  app.set('trust proxy', 1);
  configureService(app, options);
  options.configure?.(app);
  await app.listen(options.port);
  return app;
}
