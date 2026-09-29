import 'reflect-metadata';
import { startService } from '@mercadia/service-kit';
import { AppModule } from './app.module.js';
import { config } from './config.js';

export function startPayments() {
  return startService(AppModule, {
    name: 'payments',
    port: config().port,
    rawBody: true, // Stripe webhook signatures are computed over the raw body
    title: 'Payments service',
    description:
      'Stripe PaymentIntents with Connect (separate charges and transfers) or a simulated processor ' +
      "with Stripe's test cards. Seller shares are held in escrow and released on delivery; refunds " +
      'come from cancellations and resolved disputes.',
  });
}

if (import.meta.url === `file://${process.argv[1]}`) await startPayments();
