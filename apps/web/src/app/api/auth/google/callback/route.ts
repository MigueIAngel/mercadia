import { NextResponse, type NextRequest } from 'next/server';
import { postGateway } from '@/lib/bff';
import { SITE_URL } from '@/lib/gateway';
import { authCookies } from '@/lib/session';

export async function GET(request: NextRequest) {
  const [expectedState, locale = 'es'] = (request.cookies.get('mc_oauth')?.value ?? '').split('.');
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const fail = (reason: string) =>
    NextResponse.redirect(`${SITE_URL}/${locale}/login?error=${reason}`);
  if (!code || !state || state !== expectedState) return fail('google_state');

  const upstream = await postGateway(request, '/auth/google', {
    code,
    redirectUri: `${SITE_URL}/api/auth/google/callback`,
  });
  if (!upstream.ok) return fail('google_failed');
  const body = await upstream.json();
  if (body.mfaRequired) {
    return NextResponse.redirect(
      `${SITE_URL}/${locale}/login?mfa=${encodeURIComponent(body.mfaToken)}`,
    );
  }
  const response = NextResponse.redirect(`${SITE_URL}/${locale}`);
  for (const c of authCookies(body)) response.cookies.set(c.name, c.value, c.options);
  response.cookies.delete('mc_oauth');
  return response;
}
