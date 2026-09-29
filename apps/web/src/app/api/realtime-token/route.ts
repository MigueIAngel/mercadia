import { NextResponse, type NextRequest } from 'next/server';
import { clientHeadersOf } from '@/lib/bff';
import { refreshTokens } from '@/lib/gateway';
import { ACCESS_COOKIE, authCookies, isExpired, REFRESH_COOKIE } from '@/lib/session';

const PUBLIC_GATEWAY_URL = (process.env.PUBLIC_GATEWAY_URL ?? 'http://localhost:4000').replace(
  /\/$/,
  '',
);

/**
 * WebSockets can't go through the BFF, so the browser connects to the gateway directly. This
 * hands it the short-lived access token (15 min) for the Socket.IO handshake only; the refresh
 * token never leaves the httpOnly cookie.
 */
export async function GET(request: NextRequest) {
  let access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  let renewed: Awaited<ReturnType<typeof refreshTokens>> = null;
  if (refresh && isExpired(access, 60)) {
    renewed = await refreshTokens(refresh, clientHeadersOf(request));
    access = renewed?.accessToken;
  }
  if (!access) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const response = NextResponse.json(
    { token: access, url: PUBLIC_GATEWAY_URL, path: '/api/realtime/socket.io' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
  if (renewed)
    for (const c of authCookies(renewed)) response.cookies.set(c.name, c.value, c.options);
  return response;
}
