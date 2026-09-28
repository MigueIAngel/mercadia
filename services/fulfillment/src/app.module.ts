import { Module } from '@nestjs/common';
import { AuthModule, EventBusModule, HealthModule, loggingModule } from '@mercadia/service-kit';
import { AddressesController } from './addresses/addresses.controller.js';
import { OrdersClient } from './clients/orders.client.js';
import { config } from './config.js';
import { ConfigModule } from './config.module.js';
import { DatabaseModule } from './db/database.module.js';
import { DisputesController } from './disputes/disputes.controller.js';
import { DisputesService } from './disputes/disputes.service.js';
import { SellerOrdersProjection } from './projection/seller-orders.projection.js';
import { RatesController } from './rates/rates.controller.js';
import { SeedService } from './seed/seed.service.js';
import { ShipmentsController } from './shipments/shipments.controller.js';
import { ShipmentsService } from './shipments/shipments.service.js';

const settings = config();

@Module({
  imports: [
    loggingModule('fulfillment'),
    ConfigModule,
    HealthModule,
    EventBusModule.forRoot({
      service: 'fulfillment',
      redisUrl: settings.redisUrl,
      consume: settings.consumeEvents,
    }),
    AuthModule.forRoot({ jwksUrl: settings.jwksUrl, internalKey: settings.internalKey }),
    DatabaseModule,
  ],
  controllers: [AddressesController, RatesController, ShipmentsController, DisputesController],
  providers: [OrdersClient, SellerOrdersProjection, ShipmentsService, DisputesService, SeedService],
})
export class AppModule {}
