import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  calculateJwkThumbprint,
  exportJWK,
  exportPKCS8,
  generateKeyPair,
  importPKCS8,
  SignJWT,
  type CryptoKey,
  type JWK,
} from 'jose';
import { createPublicKey } from 'node:crypto';
import { JWT_AUDIENCE, JWT_ISSUER, type AccessTokenClaims } from '@mercadia/contracts';
import { CONFIG, type IdentityConfig } from '../config.js';

/**
 * RS256 signing key. Only identity holds the private key; every other service verifies
 * tokens with the public JWKS, so a leaked service cannot mint tokens.
 */
@Injectable()
export class KeysService {
  private readonly logger = new Logger(KeysService.name);
  private keys?: Promise<{ privateKey: CryptoKey; publicKey: CryptoKey; jwk: JWK }>;

  constructor(@Inject(CONFIG) private readonly config: IdentityConfig) {}

  private load() {
    this.keys ??= (async () => {
      let pem = this.config.jwtPrivateKey;
      if (!pem) {
        this.logger.warn('JWT_PRIVATE_KEY not set: generated an ephemeral key (development only)');
        const pair = await generateKeyPair('RS256', { extractable: true });
        pem = await exportPKCS8(pair.privateKey);
      }
      if (!pem.includes('BEGIN')) pem = Buffer.from(pem, 'base64').toString('utf8');
      const privateKey = await importPKCS8(pem, 'RS256', { extractable: true });
      const publicKey = createPublicKey(pem) as unknown as CryptoKey;
      const jwk = await exportJWK(publicKey);
      jwk.kid = await calculateJwkThumbprint(jwk);
      jwk.alg = 'RS256';
      jwk.use = 'sig';
      return { privateKey, publicKey, jwk };
    })();
    return this.keys;
  }

  async publicKey() {
    return (await this.load()).publicKey;
  }

  async jwks() {
    return { keys: [(await this.load()).jwk] };
  }

  async signAccessToken(claims: AccessTokenClaims): Promise<string> {
    const { privateKey, jwk } = await this.load();
    const { sub, ...rest } = claims;
    return new SignJWT({ ...rest })
      .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
      .setSubject(sub)
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.config.accessTtlSeconds}s`)
      .sign(privateKey);
  }

  /** Short-lived token proving the password step passed while 2FA is pending. */
  async signMfaToken(userId: string): Promise<string> {
    const { privateKey } = await this.load();
    return new SignJWT({ mfa: true })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject(userId)
      .setIssuer(JWT_ISSUER)
      .setAudience('mercadia-mfa')
      .setExpirationTime('5m')
      .sign(privateKey);
  }
}
