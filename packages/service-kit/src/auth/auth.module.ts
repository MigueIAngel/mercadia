import { DynamicModule, Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AUTH_OPTIONS, JwtAuthGuard, type AuthOptions } from './jwt-auth.guard.js';

@Global()
@Module({})
export class AuthModule {
  static forRoot(options: AuthOptions): DynamicModule {
    return {
      module: AuthModule,
      providers: [
        { provide: AUTH_OPTIONS, useValue: options },
        JwtAuthGuard,
        { provide: APP_GUARD, useExisting: JwtAuthGuard },
      ],
      exports: [JwtAuthGuard, AUTH_OPTIONS],
    };
  }
}
