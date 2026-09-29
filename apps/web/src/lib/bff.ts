import { NextResponse, type NextRequest } from 'next/server';
import { GATEWAY_URL, readError } from './gateway';
import { authCookies, type TokenPair } from './session';

export function clientHeadersOf(request: NextRequest): Record<string, string> {
  return {
    'x-client-ip': request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '',
    'x-client-user-agent': request.headers.get('user-agent') ?? '',
  };
}

export async function postGateway(request: NextRequest, path: string, body: unknown) {
  return fetch(`${GATEWAY_URL}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...clientHeadersOf(request) },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
}

/** Turns an identity response into cookies; only the profile goes back to the browser. */
export async function sessionResponse(upstream: Response) {
  if (!upstream.ok) {
    const error = await readError(upstream);
    return NextResponse.json({ message: error.message }, { status: upstream.status });
  }
  const body = (await upstream.json()) as TokenPair & {
    user?: unknown;
    mfaRequired?: boolean;
    mfaToken?: string;
  };
  if (body.mfaRequired) return NextResponse.json({ mfaRequired: true, mfaToken: body.mfaToken });
  const response = NextResponse.json({ user: body.user });
  for (const c of authCookies(body)) response.cookies.set(c.name, c.value, c.options);
  return response;
}
