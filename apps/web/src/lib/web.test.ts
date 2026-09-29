import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { discountPercent, money } from './format';
import { safeNext } from './redirect';
import { authCookies, claimsOf, isExpired } from './session';

const key = new TextEncoder().encode('test-secret-for-decoding-only-000');
const jwt = (expSeconds: number) =>
  new SignJWT({ roles: ['buyer'], name: 'Ana' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('u1')
    .setExpirationTime(Math.floor(Date.now() / 1000) + expSeconds)
    .sign(key);

describe('session helpers', () => {
  it('reads claims and detects expiry with a safety margin', async () => {
    const fresh = await jwt(600);
    expect(claimsOf(fresh)).toMatchObject({ sub: 'u1', name: 'Ana', roles: ['buyer'] });
    expect(isExpired(fresh)).toBe(false);
    expect(isExpired(await jwt(10))).toBe(true);
    expect(isExpired(undefined)).toBe(true);
    expect(claimsOf('garbage')).toBeNull();
  });

  it('keeps tokens in httpOnly cookies', () => {
    const cookies = authCookies({ accessToken: 'a', refreshToken: 'r', expiresIn: 900 });
    expect(cookies.every((c) => c.options.httpOnly && c.options.sameSite === 'lax')).toBe(true);
    expect(cookies[0].options.maxAge).toBe(900);
  });
});

describe('safeNext', () => {
  it.each([
    [null, '/'],
    ['/es/seller', '/seller'],
    ['/en', '/'],
    ['/account?tab=security', '/account?tab=security'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'],
    ['https://evil.com', '/'],
  ])('%s → %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});

describe('formatting', () => {
  it('formats both currencies', () => {
    expect(money(4_100_000, 'COP', 'es')).toMatch(/41\.000/);
    expect(money(1999, 'USD', 'en')).toBe('$19.99');
  });

  it('computes discounts only when there is a previous price', () => {
    expect(discountPercent(8000, 10000)).toBe(20);
    expect(discountPercent(8000, null)).toBe(0);
    expect(discountPercent(10000, 8000)).toBe(0);
  });
});
