/** Server-to-server calls from the web app (BFF) to the API gateway. */
export const GATEWAY_URL = (process.env.GATEWAY_URL ?? 'http://localhost:4000').replace(/\/$/, '');
export const SITE_URL = (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

export async function readError(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => null);
  const raw = body?.message;
  const message = Array.isArray(raw) ? raw.join(', ') : (raw ?? response.statusText);
  return new ApiError(response.status, message, body);
}

export async function refreshTokens(refreshToken: string, headers: Record<string, string> = {}) {
  const response = await fetch(`${GATEWAY_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ refreshToken }),
    cache: 'no-store',
  });
  if (!response.ok) return null;
  return (await response.json()) as {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}
