import { DynamicModule, Global, Module } from '@nestjs/common';
import { EVENT_BUS_OPTIONS, EventBus, type EventBusOptions } from './event-bus.js';

@Global()
@Module({})
export class EventBusModule {
  static forRoot(options: EventBusOptions): DynamicModule {
    return {
      module: EventBusModule,
      providers: [{ provide: EVENT_BUS_OPTIONS, useValue: options }, EventBus],
      exports: [EventBus],
    };
  }
}
