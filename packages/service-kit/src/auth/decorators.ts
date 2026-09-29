import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AccessTokenClaims, Role } from '@mercadia/contracts';

export const IS_PUBLIC = 'mercadia:public';
export const ROLES_KEY = 'mercadia:roles';
export const INTERNAL_KEY = 'mercadia:internal';

/** No authentication required. A valid token, if sent, is still decoded. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Requires at least one of the roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Service-to-service endpoint: requires the shared `x-internal-key` header. */
export const Internal = () => SetMetadata(INTERNAL_KEY, true);

export type AuthUser = AccessTokenClaims;

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser | undefined => ctx.switchToHttp().getRequest().user,
);
