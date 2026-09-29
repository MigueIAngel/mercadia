import 'server-only';
import { cookies, headers } from 'next/headers';
import type { Currency } from '@mercadia/contracts';
import { ApiError, GATEWAY_URL, readError } from './gateway';
import { ACCESS_COOKIE, CART_COOKIE, claimsOf, CURRENCY_COOKIE } from './session';

export { ApiError };

async function clientHeaders(): Promise<Record<string, string>> {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? '';
  return { 'x-client-ip': ip, 'x-client-user-agent': h.get('user-agent') ?? '' };
}

/**
 * Fetch from the gateway during server rendering. Tokens stay in httpOnly cookies and are
 * attached here; the browser never sees them.
 */
export async function api<T>(
  path: string,
  init: RequestInit & { auth?: boolean; revalidate?: number } = {},
): Promise<T> {
  const { auth = true, revalidate, ...rest } = init;
  const jar = await cookies();
  const token = auth ? jar.get(ACCESS_COOKIE)?.value : undefined;
  const cartId = jar.get(CART_COOKIE)?.value;
  const response = await fetch(`${GATEWAY_URL}/api${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(await clientHeaders()),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(cartId && { 'x-cart-id': cartId }),
      ...rest.headers,
    },
    ...(revalidate !== undefined && !token ? { next: { revalidate } } : { cache: 'no-store' }),
  });
  if (!response.ok) throw await readError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function session() {
  const jar = await cookies();
  return claimsOf(jar.get(ACCESS_COOKIE)?.value);
}

export async function currency(): Promise<Currency> {
  const jar = await cookies();
  return jar.get(CURRENCY_COOKIE)?.value === 'USD' ? 'USD' : 'COP';
}
