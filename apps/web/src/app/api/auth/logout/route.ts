import { NextResponse, type NextRequest } from 'next/server';
import { postGateway } from '@/lib/bff';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/session';

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (refreshToken)
    await postGateway(request, '/auth/logout', { refreshToken }).catch(() => undefined);
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(ACCESS_COOKIE);
  response.cookies.delete(REFRESH_COOKIE);
  return response;
}
