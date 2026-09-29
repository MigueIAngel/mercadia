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

  // Opening a store returns a fresh session (new roles): keep tokens out of the browser.
  if (upstream.ok && request.method === 'POST' && path.join('/') === 'stores') {
    const session = (await upstream.json()) as Parameters<typeof authCookies>[0] & {
      user: unknown;
    };
    const response = NextResponse.json({ user: session.user }, { status: upstream.status });
    for (const c of authCookies(session)) response.cookies.set(c.name, c.value, c.options);
    return response;
  }

  // Name or photo changed: renew the access token so the header shows them right away.
  if (upstream.ok && request.method === 'PATCH' && path.join('/') === 'users/me' && refresh) {
    // The refresh token rotates: use the new one if this request already renewed it.
    renewed =
      (await refreshTokens(renewed?.refreshToken ?? refresh, clientHeadersOf(request))) ?? renewed;
  }

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
