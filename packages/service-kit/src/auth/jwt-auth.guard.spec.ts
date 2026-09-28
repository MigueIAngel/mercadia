import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { JWT_AUDIENCE, JWT_ISSUER } from '@mercadia/contracts';
import { INTERNAL_KEY, IS_PUBLIC, ROLES_KEY } from './decorators.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

function context(headers: Record<string, string>, meta: Record<string, unknown> = {}) {
  const request: Record<string, unknown> = { headers };
  const handler = () => undefined;
  for (const [k, v] of Object.entries(meta)) Reflect.defineMetadata(k, v, handler);
  return {
    request,
    ctx: {
      getType: () => 'http',
      getHandler: () => handler,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
  };
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let sign: (claims: object, issuer?: string) => Promise<string>;

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    guard = new JwtAuthGuard(new Reflector(), {
      localKey: async () => publicKey,
      internalKey: 'secret',
    });
    sign = (claims, issuer = JWT_ISSUER) =>
      new SignJWT({ ...claims })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuer(issuer)
        .setAudience(JWT_AUDIENCE)
        .setSubject('u1')
        .setExpirationTime('5m')
        .sign(privateKey);
  });

  it('accepts a valid token and exposes the claims', async () => {
    const token = await sign({ email: 'a@b.co', roles: ['buyer'] });
    const { ctx, request } = context({ authorization: `Bearer ${token}` });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toMatchObject({ sub: 'u1', roles: ['buyer'] });
  });

  it('rejects missing and forged tokens', async () => {
    await expect(guard.canActivate(context({}).ctx)).rejects.toThrow(UnauthorizedException);
    const forged = await sign({ roles: ['admin'] }, 'someone-else');
    await expect(
      guard.canActivate(context({ authorization: `Bearer ${forged}` }).ctx),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('enforces roles', async () => {
    const token = await sign({ roles: ['buyer'] });
    const { ctx } = context({ authorization: `Bearer ${token}` }, { [ROLES_KEY]: ['admin'] });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('lets anonymous users through public routes', async () => {
    await expect(guard.canActivate(context({}, { [IS_PUBLIC]: true }).ctx)).resolves.toBe(true);
  });

  it('protects internal endpoints with the shared key', async () => {
    const meta = { [INTERNAL_KEY]: true };
    await expect(
      guard.canActivate(context({ 'x-internal-key': 'secret' }, meta).ctx),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(context({ 'x-internal-key': 'nope' }, meta).ctx),
    ).rejects.toThrow(ForbiddenException);
  });
});
