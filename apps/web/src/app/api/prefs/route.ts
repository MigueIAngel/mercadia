import { NextResponse, type NextRequest } from 'next/server';
import { CURRENCY_COOKIE } from '@/lib/session';

export async function POST(request: NextRequest) {
  const { currency } = (await request.json()) as { currency?: string };
  const response = NextResponse.json({ ok: true });
  response.cookies.set(CURRENCY_COOKIE, currency === 'USD' ? 'USD' : 'COP', {
    path: '/',
    maxAge: 365 * 24 * 3600,
    sameSite: 'lax',
  });
  return response;
}
