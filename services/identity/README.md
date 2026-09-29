# Identity service

NestJS + PostgreSQL (Drizzle). Owns accounts, sessions, stores and the security audit log,
and is the only service holding the JWT signing key.

| | |
| --- | --- |
| Port | 4001 |
| Database | PostgreSQL `identity` (Drizzle migrations in `drizzle/`, applied on boot) |
| Publishes | `user.registered`, `store.opened`, `store.updated` (through a transactional outbox) |
| Consumes | `store.payouts_enabled` |

## Security features

- **Argon2id** password hashing (OWASP parameters) and constant-time behaviour for unknown emails.
- **RS256 access tokens** (15 min). Other services verify them with `/.well-known/jwks.json`.
- **Rotating refresh tokens** grouped in families. Reusing an already rotated token revokes the
  whole session and is written to the audit log.
- **Brute-force lock**: 5 failed logins lock the account for 15 minutes (Redis counters).
- **TOTP two-factor authentication** (RFC 6238) with QR enrolment, encrypted secrets (AES-256-GCM)
  and 10 single-use recovery codes.
- **Google sign-in** with the authorization-code flow done server side. The ID token is verified
  against Google's JWKS, and accounts are linked by verified email.
- **RBAC**: every account buys; opening a store adds `seller`. `admin` manages users and stores.
- **Audit log** of logins, failures, 2FA changes, session revocations and admin actions.

## Endpoints (main)

| Method | Path | |
| --- | --- | --- |
| POST | `/auth/register`, `/auth/login`, `/auth/login/2fa`, `/auth/refresh`, `/auth/logout` | Sessions |
| GET/POST | `/auth/google/url`, `/auth/google` | Google sign-in |
| POST | `/auth/demo` | One-click demo buyer / seller / admin |
| POST | `/auth/2fa/setup`, `/auth/2fa/enable`, `/auth/2fa/disable` | TOTP |
| GET/PATCH | `/users/me`, `/users/me/sessions`, `/users/me/security-log` | Profile and security |
| POST | `/users/me/avatar/signature` | Signed direct upload of the profile photo to Cloudinary (`CLOUDINARY_URL`); the photo URL goes in the `picture` claim |
| GET/POST/PATCH | `/stores`, `/stores/mine`, `/stores/:slug` | Stores |
| GET/PATCH | `/admin/users`, `/admin/stores`, `/admin/audit`, `/admin/stats` | Admin console |

Swagger UI at `/docs`.

## Development

```bash
npm run infra:up                       # from the repo root
npm run build -w @mercadia/identity && npm start -w @mercadia/identity
npm test -w @mercadia/identity         # 16 e2e tests against real Postgres + Redis
npm run db:generate -w @mercadia/identity   # after editing src/db/schema.ts
```
