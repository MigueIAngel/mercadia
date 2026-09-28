import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { CONFIG, type IdentityConfig } from '../config.js';

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

/** OAuth 2.0 authorization-code flow with Google, done server side (no client secret in the browser). */
@Injectable()
export class GoogleService {
  constructor(@Inject(CONFIG) private readonly config: IdentityConfig) {}

  get enabled() {
    return Boolean(this.config.googleClientId && this.config.googleClientSecret);
  }

  authorizationUrl(redirectUri: string, state: string) {
    if (!this.enabled) throw new ServiceUnavailableException('Google sign-in is not configured');
    const params = new URLSearchParams({
      client_id: this.config.googleClientId!,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async exchange(code: string, redirectUri: string): Promise<GoogleProfile> {
    if (!this.enabled) throw new ServiceUnavailableException('Google sign-in is not configured');
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.config.googleClientId!,
        client_secret: this.config.googleClientSecret!,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(8000),
    });
    const body = (await response.json()) as { id_token?: string; error_description?: string };
    if (!response.ok || !body.id_token) {
      throw new BadRequestException(body.error_description ?? 'Google sign-in failed');
    }
    const { payload } = await jwtVerify(body.id_token, GOOGLE_JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: this.config.googleClientId,
    });
    if (!payload.email || payload.email_verified !== true) {
      throw new BadRequestException('Google account email is not verified');
    }
    return {
      sub: payload.sub!,
      email: String(payload.email),
      name: String(payload.name ?? payload.email),
      picture: payload.picture as string | undefined,
    };
  }
}
