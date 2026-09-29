# Mercadia

A multi-vendor marketplace for Colombia, built as a set of microservices: anyone can buy and
open a store; payments are held in escrow until delivery; buyers and sellers chat in real
time; and an AI assistant helps shoppers find products.

**Live demo:** https://mercadia-web.onrender.com (free hosting: the first visit can take about
a minute while the containers wake up). Use the **Buyer**, **Seller** or **Admin** demo buttons
on the login page; every demo account uses the password `Mercadia2026!`. Payments run in
Stripe test mode, so use the card `4242 4242 4242 4242` with any future date and CVC.

API docs (all services): https://mercadia-api-p9fn.onrender.com/docs

## What it does

| Area | Features |
| --- | --- |
| Shopping | Catalog with variants, typo-tolerant search with facets (Atlas Search), COP/USD with live exchange rate and IVA, guest cart merged at sign-in, multi-store checkout with shipping rates per region |
| Payments | Stripe test mode + Connect: one charge per order, separate transfers per seller held until delivery, refunds; saved cards (Stripe SetupIntents, one-click pay, 3-D Secure) and a full-screen payment animation; a built-in simulator with Stripe's test cards when no key is set |
| After the sale | Shipments with simulated carrier tracking, public tracking page, returns and disputes with seller deadlines and admin escalation |
| Community | Verified-purchase reviews, store reputation and seller replies, real-time buyer–seller chat (Socket.IO), notifications in-app, live and by email, wishlist with price-drop alerts |
| Sellers & admins | Seller center (products, orders, shipping labels, payouts, disputes, reviews, sales chart), admin console (users, stores, moderation, disputes, audit log, GMV) |
| AI | Shopping assistant with Gemini function calling (searches the catalog, opens products, checks your orders and shipments), semantic search and recommendations with Atlas Vector Search, AI copywriter for sellers |
| Experience | Profile photos (direct signed upload to Cloudinary), skeleton loaders, navigation progress bar, toasts, scroll reveal and micro-interactions (respecting reduced motion) |
| Security | RS256 JWT with JWKS, rotating refresh tokens with reuse detection, TOTP 2FA with recovery codes, Google sign-in, RBAC, account lockout, audit log, httpOnly-cookie BFF |

## Architecture

```
                Next.js 16 (BFF, ES/EN)
                        │
                API gateway (NestJS) ── rate limit · circuit breakers · WebSocket proxy · unified docs
   ┌───────────┬────────┼──────────┬─────────────┬──────────────┬───────────────┐
identity    catalog   orders    payments    fulfillment    engagement      ai (FastAPI)
Postgres    MongoDB   Postgres  Postgres    Postgres       MongoDB         MongoDB vectors
   └───────────┴────────┴───── Redis Streams (events, sagas, outbox) ─────┴───────────────┘
```

- **Polyglot persistence**: PostgreSQL (Drizzle) where money and state machines live, MongoDB
  for flexible product data, reviews, chat and vectors, Redis for events, rate limits and
  caches.
- **Events and sagas**: services communicate through Redis Streams with consumer groups,
  idempotency keys and a dead-letter stream. Postgres services publish through a
  transactional outbox. The order saga: placed → stock reserved (Mongo transaction) → paid →
  per-seller fulfillment → delivered → escrow released, with compensation on cancellation,
  expiry and refunds.
- **Demo data on every boot**: 8 stores, 12 users, 194 products with real photos, 582 reviews
  and 80 orders are seeded idempotently (deterministic ids), so a free database that gets
  reset is never empty.

Each service has its own README: [identity](services/identity) · [catalog](services/catalog) ·
[orders](services/orders) · [payments](services/payments) ·
[fulfillment](services/fulfillment) · [engagement](services/engagement) · [ai](services/ai) ·
[gateway](services/gateway) · [web](apps/web). Deployment and observability:
[deploy](deploy).

## Tech stack

TypeScript · NestJS 12 · Next.js 16 · React 19 · Tailwind 4 · next-intl · Python 3.13 ·
FastAPI · PostgreSQL 17 · Drizzle · MongoDB 8 (Atlas Search, Vector Search) · Mongoose ·
Redis Streams · Socket.IO · Stripe Connect · Gemini (function calling, embeddings) ·
Cloudinary · OpenTelemetry · Prometheus · Grafana · Jaeger · Docker · GitHub Actions · Render

## Run it locally

Requires Node 22+, Docker and Python 3.13.

```bash
npm install
npm run infra:up                      # MongoDB (Atlas Local), Postgres, Redis, Mailpit…
npm run build
(cd services/ai && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt)
npm run start:all                     # every service; npm run start:traced adds tracing
npm run dev -w @mercadia/web          # http://localhost:3000
```

Or everything in containers: `docker compose up --build`. Emails land in Mailpit
(http://localhost:8025). Without API keys the platform still works end to end: payments use
the built-in simulator, the AI uses local embeddings and a rule-based assistant, and uploads
fall back to image URLs.

## Quality

- End-to-end tests per service against real databases (Vitest + Supertest, pytest): auth
  flows, sagas, stock reservations, escrow, disputes, realtime chat, AI tools.
- CI on every pull request: formatting, build, lint and tests for the TypeScript workspaces
  and the Python service.
- Git flow with feature branches, pull requests and tagged releases.
