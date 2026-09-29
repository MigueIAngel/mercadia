import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type CryptoKey, type JWTVerifyGetKey } from 'jose';
import { JWT_AUDIENCE, JWT_ISSUER, type AccessTokenClaims, type Role } from '@mercadia/contracts';
import { INTERNAL_KEY, IS_PUBLIC, ROLES_KEY } from './decorators.js';

export const AUTH_OPTIONS = Symbol('AUTH_OPTIONS');

export interface AuthOptions {
  /** Where identity publishes its public keys. */
  jwksUrl?: string;
  /** The identity service verifies with its own key instead of fetching the JWKS. */
  localKey?: () => Promise<CryptoKey>;
  internalKey: string;
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Zero-trust auth: every service verifies the RS256 access token itself (via the identity
 * JWKS), so nothing depends on the gateway having checked it.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private jwks?: JWTVerifyGetKey;

  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH_OPTIONS) private readonly options: AuthOptions,
  ) {}

  private flag<T>(key: string, context: ExecutionContext): T | undefined {
    return this.reflector.getAllAndOverride<T>(key, [context.getHandler(), context.getClass()]);
  }

  async verify(token: string): Promise<AccessTokenClaims> {
    const key = this.options.localKey
      ? await this.options.localKey()
      : (this.jwks ??= createRemoteJWKSet(new URL(this.options.jwksUrl!), {
          cooldownDuration: 30_000,
        }));
    const { payload } = await jwtVerify(token, key as never, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: ['RS256'],
    });
    return payload as unknown as AccessTokenClaims;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest();

    if (this.flag<boolean>(INTERNAL_KEY, context)) {
      const key = request.headers['x-internal-key'];
      if (typeof key === 'string' && safeEqual(key, this.options.internalKey)) return true;
      throw new ForbiddenException('Internal endpoint');
    }

    const header: string | undefined = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const isPublic = this.flag<boolean>(IS_PUBLIC, context);

    if (token) {
      try {
        request.user = await this.verify(token);
      } catch {
        if (!isPublic) throw new UnauthorizedException('Invalid or expired token');
      }
    }
    if (isPublic) return true;
    if (!request.user) throw new UnauthorizedException('Authentication required');

    const roles = this.flag<Role[]>(ROLES_KEY, context);
    if (roles?.length && !roles.some((role) => request.user.roles.includes(role))) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
