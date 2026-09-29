import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import {
  AuthModule,
  EventBus,
  EventBusModule,
  HealthModule,
  HealthRegistry,
  loggingModule,
} from '@mercadia/service-kit';
import { config } from './config.js';
import { ConfigModule } from './config.module.js';
import { CurrencyController } from './currency/currency.controller.js';
import { RatesService } from './currency/rates.service.js';
import { Product, ProductSchema } from './products/product.schema.js';
import { ProductsController } from './products/products.controller.js';
import { ProductsService } from './products/products.service.js';
import { SeedService } from './seed/seed.service.js';
import { Reservation, ReservationSchema } from './stock/reservation.schema.js';
import { StockService } from './stock/stock.service.js';
import { StoreView, StoreViewSchema } from './stores/store.schema.js';
import { StoresProjection } from './stores/stores.service.js';
import { UploadsController } from './uploads/uploads.controller.js';

const settings = config();

@Module({
  imports: [
    loggingModule('catalog'),
    ConfigModule,
    HealthModule,
    MongooseModule.forRoot(settings.mongoUri, { dbName: settings.mongoDb }),
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: StoreView.name, schema: StoreViewSchema },
      { name: Reservation.name, schema: ReservationSchema },
    ]),
    EventBusModule.forRoot({
      service: 'catalog',
      redisUrl: settings.redisUrl,
      consume: settings.consumeEvents,
    }),
    AuthModule.forRoot({ jwksUrl: settings.jwksUrl, internalKey: settings.internalKey }),
  ],
  controllers: [ProductsController, CurrencyController, UploadsController],
  providers: [ProductsService, RatesService, StockService, StoresProjection, SeedService],
})
export class AppModule implements OnModuleInit {
  constructor(
    @Inject(getConnectionToken()) private readonly connection: Connection,
    private readonly health: HealthRegistry,
    private readonly bus: EventBus,
    private readonly products: ProductsService,
  ) {}

  onModuleInit() {
    this.health.add('mongodb', () => this.connection.db!.admin().ping());
    this.bus.on('review.created', ({ data }) =>
      this.products.applyRating(data.productId, data.rating),
    );
  }
}
