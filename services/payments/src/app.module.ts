import { Logger, Module } from '@nestjs/common';
import { AuthModule, EventBusModule, HealthModule, loggingModule } from '@mercadia/service-kit';
import { OrdersClient } from './clients/orders.client.js';
import { config, CONFIG, type PaymentsConfig } from './config.js';
import { ConfigModule } from './config.module.js';
import { DatabaseModule } from './db/database.module.js';
import { PaymentsController } from './payments/payments.controller.js';
import { PaymentsSaga } from './payments/payments.saga.js';
import { PaymentsService } from './payments/payments.service.js';
import { MockProvider } from './providers/mock.provider.js';
import { PaymentProvider } from './providers/payment-provider.js';
import { StripeProvider } from './providers/stripe.provider.js';
import { SeedService } from './seed/seed.service.js';
import { StripeWebhookController } from './webhooks/stripe-webhook.controller.js';

const settings = config();

@Module({
  imports: [
    loggingModule('payments'),
    ConfigModule,
    HealthModule,
    EventBusModule.forRoot({
      service: 'payments',
      redisUrl: settings.redisUrl,
      consume: settings.consumeEvents,
    }),
    AuthModule.forRoot({ jwksUrl: settings.jwksUrl, internalKey: settings.internalKey }),
    DatabaseModule,
  ],
  controllers: [PaymentsController, StripeWebhookController],
  providers: [
    {
      provide: PaymentProvider,
      inject: [CONFIG],
      useFactory: (c: PaymentsConfig) => {
        if (c.stripeSecretKey?.startsWith('sk_test_'))
          return new StripeProvider(c.stripeSecretKey, c.stripePublishableKey ?? null);
        if (c.stripeSecretKey)
          new Logger('Payments').warn(
            'Only Stripe test keys are accepted; using the simulated processor',
          );
        return new MockProvider();
      },
    },
    PaymentsService,
    PaymentsSaga,
    OrdersClient,
    SeedService,
  ],
})
export class AppModule {}
