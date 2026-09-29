export const ROLES = ['buyer', 'seller', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** Claims carried by the access token issued by the identity service. */
export interface AccessTokenClaims {
  sub: string;
  email: string;
  name: string;
  roles: Role[];
  /** Present when the user owns a store. */
  storeId?: string;
  /** Profile photo URL, when the user has one. */
  picture?: string;
}

export const JWT_ISSUER = 'mercadia-identity';
export const JWT_AUDIENCE = 'mercadia';
