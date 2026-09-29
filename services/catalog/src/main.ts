import 'reflect-metadata';
import { startService } from '@mercadia/service-kit';
import { AppModule } from './app.module.js';
import { config } from './config.js';

export function startCatalog() {
  return startService(AppModule, {
    name: 'catalog',
    port: config().port,
    title: 'Catalog service',
    description:
      'Products with variants, Atlas Search (typo-tolerant search and autocomplete), faceted ' +
      'filtering, COP/USD pricing with live exchange rates, seller product management, ' +
      'moderation, and stock reservations for checkout (MongoDB transactions).',
  });
}

if (import.meta.url === `file://${process.argv[1]}`) await startCatalog();
