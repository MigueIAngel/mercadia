import { decodeJwt } from 'jose';
import type { AccessTokenClaims } from '@mercadia/contracts';

export const ACCESS_COOKIE = 'mc_at';
export const REFRESH_COOKIE = 'mc_rt';
export const CURRENCY_COOKIE = 'mc_currency';
export const CART_COOKIE = 'mc_cart';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Reads the claims for rendering decisions only (menus, redirects). Every service verifies
 * the signature itself, so a tampered cookie gets nothing but 401s.
 */
export function claimsOf(token: string | undefined): (AccessTokenClaims & { exp?: number }) | null {
  if (!token) return null;
  try {
    return decodeJwt(token) as AccessTokenClaims & { exp?: number };
  } catch {
    return null;
  }
}

export function isExpired(token: string | undefined, skewSeconds = 30): boolean {
  const exp = claimsOf(token)?.exp;
  return !exp || exp * 1000 < Date.now() + skewSeconds * 1000;
}

const secure = process.env.NODE_ENV === 'production';

export function authCookies(tokens: TokenPair) {
  return [
    {
      name: ACCESS_COOKIE,
      value: tokens.accessToken,
      options: {
        httpOnly: true,
        secure,
        sameSite: 'lax' as const,
        path: '/',
        maxAge: tokens.expiresIn,
      },
    },
    {
      name: REFRESH_COOKIE,
      value: tokens.refreshToken,
      options: {
        httpOnly: true,
        secure,
        sameSite: 'lax' as const,
        path: '/',
        maxAge: 30 * 24 * 3600,
      },
    },
  ];
}
