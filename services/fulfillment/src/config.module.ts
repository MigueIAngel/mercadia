import { Global, Module } from '@nestjs/common';
import { config, CONFIG } from './config.js';

@Global()
@Module({
  providers: [{ provide: CONFIG, useFactory: config }],
  exports: [CONFIG],
})
export class ConfigModule {}
