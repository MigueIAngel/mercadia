import 'reflect-metadata';
import { startService } from '@mercadia/service-kit';
import { AppModule } from './app.module.js';
import { config } from './config.js';

export function startIdentity() {
  return startService(AppModule, {
    name: 'identity',
    port: config().port,
    title: 'Identity service',
    description:
      'Accounts that can buy and sell, sessions with rotating refresh tokens, TOTP two-factor ' +
      'authentication, Google sign-in, stores, RBAC and an audit log. Access tokens are RS256 ' +
      'JWTs; the public keys are at /.well-known/jwks.json.',
  });
}

if (import.meta.url === `file://${process.argv[1]}`) await startIdentity();
