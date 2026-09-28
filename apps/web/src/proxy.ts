import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { refreshTokens } from './lib/gateway';
import { ACCESS_COOKIE, authCookies, isExpired, REFRESH_COOKIE } from './lib/session';
import { routing } from './i18n/routing';

const intl = createMiddleware(routing);

/**
 * 1. Keeps the session alive: an expired access token is renewed with the refresh token
 *    before rendering (a redirect to the same URL carries the new cookies to the page).
 * 2. Locale detection and prefixing (`/es/...`, `/en/...`).
 */
export default async function proxy(request: NextRequest) {
  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  if (request.method === 'GET' && refresh && isExpired(access)) {
    const tokens = await refreshTokens(refresh, {
      'x-client-ip': request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '',
      'x-client-user-agent': request.headers.get('user-agent') ?? '',
    });
    const response = NextResponse.redirect(request.nextUrl);
    if (tokens) {
      for (const c of authCookies(tokens)) response.cookies.set(c.name, c.value, c.options);
    } else {
      response.cookies.delete(ACCESS_COOKIE);
      response.cookies.delete(REFRESH_COOKIE);
    }
    return response;
  }
  return intl(request);
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
