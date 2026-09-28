import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { config } from './config.js';
import { configureGateway } from './setup.js';

export async function startGateway() {
  // No body parser: request bodies stream untouched to the services (uploads, webhooks).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.set('trust proxy', 1);
  const { attachWebsockets } = configureGateway(app);
  await app.listen(config().port);
  attachWebsockets(app.getHttpServer());
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) await startGateway();
