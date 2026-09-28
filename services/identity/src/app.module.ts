import { Module, OnModuleInit } from '@nestjs/common';
import {
  AuthModule,
  EventBus,
  EventBusModule,
  HealthModule,
  loggingModule,
} from '@mercadia/service-kit';
import { AdminController } from './admin/admin.controller.js';
import { AuditService } from './audit/audit.service.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { GoogleService } from './auth/google.service.js';
import { LoginThrottleService } from './auth/login-throttle.service.js';
import { TokensService } from './auth/tokens.service.js';
import { TotpService } from './auth/totp.service.js';
import { config } from './config.js';
import { ConfigModule } from './config.module.js';
import { DatabaseModule } from './db/database.module.js';
import { JwksController } from './keys/jwks.controller.js';
import { KeysService } from './keys/keys.service.js';
import { SeedService } from './seed/seed.service.js';
import { StoresController } from './stores/stores.controller.js';
import { StoresService } from './stores/stores.service.js';
import { UsersController } from './users/users.controller.js';

const settings = config();
// One KeysService instance shared by the global guard and the controllers.
const keys = new KeysService(settings);

@Module({
  imports: [
    loggingModule('identity'),
    HealthModule,
    EventBusModule.forRoot({
      service: 'identity',
      redisUrl: settings.redisUrl,
      consume: settings.consumeEvents,
    }),
    AuthModule.forRoot({
      internalKey: settings.internalKey,
      // Identity verifies with its own key; the others fetch /.well-known/jwks.json.
      localKey: () => keys.publicKey(),
    }),
    ConfigModule,
    DatabaseModule,
  ],
  controllers: [AuthController, UsersController, StoresController, AdminController, JwksController],
  providers: [
    { provide: KeysService, useFactory: () => keys },
    TokensService,
    AuthService,
    TotpService,
    GoogleService,
    LoginThrottleService,
    AuditService,
    StoresService,
    SeedService,
  ],
})
export class AppModule implements OnModuleInit {
  constructor(
    private readonly bus: EventBus,
    private readonly stores: StoresService,
  ) {}

  onModuleInit() {
    this.bus.on('store.payouts_enabled', (event) =>
      this.stores.setPayoutsEnabled(event.data.storeId),
    );
  }
}
