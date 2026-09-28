import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { JWT_AUDIENCE, JWT_ISSUER, type AccessTokenClaims } from '@mercadia/contracts';

process.env.CATALOG_MONGODB_DB = 'catalog_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/13';
process.env.CONSUME_EVENTS = 'false';
process.env.FETCH_FX_RATES = 'false';
process.env.FX_USD_COP = '4000';
process.env.ATLAS_SEARCH = 'false';
process.env.LOG_LEVEL = 'silent';

/** A throwaway identity: serves a JWKS and signs tokens like the real one. */
const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'RS256', use: 'sig' };
const server = createServer((_, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ keys: [jwk] }));
}).listen(0);
await new Promise((resolve) => server.once('listening', resolve));
process.env.JWKS_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/jwks.json`;

export function tokenFor(
  claims: Omit<AccessTokenClaims, 'email' | 'name'> & { email?: string; name?: string },
) {
  const { sub, ...rest } = claims;
  return new SignJWT({ email: 'test@example.com', name: 'Test', ...rest })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setSubject(sub)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime('10m')
    .sign(privateKey);
}
