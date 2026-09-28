import 'reflect-metadata';
import { startService } from '@mercadia/service-kit';
import { AppModule } from './app.module.js';
import { config } from './config.js';

export function startOrders() {
  return startService(AppModule, {
    name: 'orders',
    port: config().port,
    title: 'Orders service',
    description:
      'Guest and account carts (merged at sign-in), checkout with shipping per store, orders split ' +
      'into one seller order per store with commission, and the order saga (stock, payment, shipping, ' +
      'refunds). Events go out through a transactional outbox.',
  });
}

if (import.meta.url === `file://${process.argv[1]}`) await startOrders();
