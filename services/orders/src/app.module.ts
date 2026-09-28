import { Module } from '@nestjs/common';
import { AuthModule, EventBusModule, HealthModule, loggingModule } from '@mercadia/service-kit';
import { CartController } from './cart/cart.controller.js';
import { CartService } from './cart/cart.service.js';
import { CheckoutController } from './checkout/checkout.controller.js';
import { CheckoutService } from './checkout/checkout.service.js';
import { CatalogClient } from './clients/catalog.client.js';
import { FulfillmentClient } from './clients/fulfillment.client.js';
import { config } from './config.js';
import { ConfigModule } from './config.module.js';
import { DatabaseModule } from './db/database.module.js';
import { OrdersController } from './orders/orders.controller.js';
import { OrdersService } from './orders/orders.service.js';
import { OrderSaga } from './saga/order-saga.js';
import { SeedService } from './seed/seed.service.js';

const settings = config();

@Module({
  imports: [
    loggingModule('orders'),
    ConfigModule,
    HealthModule,
    EventBusModule.forRoot({
      service: 'orders',
      redisUrl: settings.redisUrl,
      consume: settings.consumeEvents,
    }),
    AuthModule.forRoot({ jwksUrl: settings.jwksUrl, internalKey: settings.internalKey }),
    DatabaseModule,
  ],
  controllers: [CartController, CheckoutController, OrdersController],
  providers: [
    CartService,
    CheckoutService,
    OrdersService,
    CatalogClient,
    FulfillmentClient,
    OrderSaga,
    SeedService,
  ],
})
export class AppModule {}
