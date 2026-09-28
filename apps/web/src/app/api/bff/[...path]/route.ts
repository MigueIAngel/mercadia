import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { clientHeadersOf } from '@/lib/bff';
import { GATEWAY_URL, refreshTokens } from '@/lib/gateway';
import { ACCESS_COOKIE, authCookies, CART_COOKIE, isExpired, REFRESH_COOKIE } from '@/lib/session';

/**
 * Backend-for-frontend: client components call `/api/bff/<path>` and this handler forwards
 * to the gateway with the access token from the httpOnly cookie, refreshing it if needed.
 */
async function handle(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const target = `${GATEWAY_URL}/api/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;
  let access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  let renewed: Awaited<ReturnType<typeof refreshTokens>> = null;

  if (refresh && isExpired(access)) {
    renewed = await refreshTokens(refresh, clientHeadersOf(request));
    access = renewed?.accessToken;
  }

  // Guests get an anonymous cart id; orders merges it into the account cart at sign-in.
  let cartId = request.cookies.get(CART_COOKIE)?.value;
  const newCart = !cartId;
  cartId ??= randomUUID();

  const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();
  const upstream = await fetch(target, {
    method: request.method,
    headers: {
      'Content-Type': request.headers.get('content-type') ?? 'application/json',
      ...clientHeadersOf(request),
      'x-cart-id': cartId,
      ...(access && { Authorization: `Bearer ${access}` }),
    },
    body,
    cache: 'no-store',
  });

  const response = new NextResponse(upstream.status === 204 ? null : upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
  });
  if (renewed)
    for (const c of authCookies(renewed)) response.cookies.set(c.name, c.value, c.options);
  if (newCart) {
    response.cookies.set(CART_COOKIE, cartId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 24 * 3600,
    });
  }
  return response;
}

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
