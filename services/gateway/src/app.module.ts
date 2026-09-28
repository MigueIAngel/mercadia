import { Module } from '@nestjs/common';
import { AuthModule, HealthModule, loggingModule } from '@mercadia/service-kit';
import { StorefrontController } from './composition/storefront.controller.js';
import { config, CONFIG } from './config.js';
import { DocsController } from './docs/docs.controller.js';
import { GatewayHealthController } from './health/health.controller.js';
import { ServiceRegistry } from './resilience/registry.js';
import { RateLimiter } from './security/rate-limiter.js';

const settings = config();

@Module({
  imports: [
    loggingModule('gateway'),
    HealthModule,
    // The gateway does not verify tokens itself (services do); its own routes are public.
    AuthModule.forRoot({
      internalKey: 'unused',
      jwksUrl: `${settings.urls.identity}/.well-known/jwks.json`,
    }),
  ],
  controllers: [GatewayHealthController, StorefrontController, DocsController],
  providers: [{ provide: CONFIG, useValue: settings }, ServiceRegistry, RateLimiter],
  exports: [CONFIG],
})
export class AppModule {}
