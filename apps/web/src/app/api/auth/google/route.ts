import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { GATEWAY_URL, SITE_URL } from '@/lib/gateway';

/** Starts Google sign-in; the state cookie protects the callback against CSRF. */
export async function GET(request: NextRequest) {
  const state = randomBytes(16).toString('hex');
  const locale = request.nextUrl.searchParams.get('locale') === 'en' ? 'en' : 'es';
  const redirectUri = `${SITE_URL}/api/auth/google/callback`;
  const res = await fetch(
    `${GATEWAY_URL}/api/auth/google/url?${new URLSearchParams({ redirectUri, state })}`,
    { cache: 'no-store' },
  );
  if (!res.ok) return NextResponse.redirect(`${SITE_URL}/${locale}/login?error=google_unavailable`);
  const { url } = (await res.json()) as { url: string };
  const response = NextResponse.redirect(url);
  response.cookies.set('mc_oauth', `${state}.${locale}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
  });
  return response;
}
