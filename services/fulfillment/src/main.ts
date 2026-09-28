import 'reflect-metadata';
import { startService } from '@mercadia/service-kit';
import { AppModule } from './app.module.js';
import { config } from './config.js';

export function startFulfillment() {
  return startService(AppModule, {
    name: 'fulfillment',
    port: config().port,
    title: 'Fulfillment service',
    description:
      'Address book, shipping rates by Colombian region, shipments with a simulated carrier and ' +
      'public tracking, and returns/disputes with seller response and admin mediation.',
  });
}

if (import.meta.url === `file://${process.argv[1]}`) await startFulfillment();
