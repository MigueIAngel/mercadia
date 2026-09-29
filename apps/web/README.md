# Web (storefront, seller center, admin)

Next.js 16 (App Router, React 19) + Tailwind 4 + next-intl (ES/EN). The visual design and
cart logic were recycled from [Shopfront](https://github.com/MigueIAngel/shopfront).

## Highlights

- **Backend-for-frontend**: tokens never reach the browser. Sign-in stores the access and
  refresh tokens in httpOnly cookies; server components call the gateway with them, and
  client components go through `/api/bff/*`, which forwards to the gateway and refreshes
  expired tokens. `proxy.ts` refreshes the session on navigation.
- **Realtime**: `/api/realtime-token` hands the short-lived access token to the browser only
  for the Socket.IO handshake (chat, notification bell).
- **Pages**: home, search with facets and AI semantic fallback, product (variants, reviews,
  wishlist, ask the seller, AI similar products), stores with reputation, cart, checkout with
  an address book, payment (Stripe Elements or test cards), orders with live tracking and
  disputes, messages, wishlist, account security (2FA, sessions, audit), seller center with
  the AI copywriter, admin console, and a floating AI shopping assistant.
- Guest carts (`mc_cart` cookie) are merged into the account at sign-in; currency (COP/USD) and
  language are per-visitor preferences.

## Development

```bash
npm run dev -w @mercadia/web     # http://localhost:3000, expects the gateway on :4000
npm test -w @mercadia/web
```

Environment: `GATEWAY_URL` (server-side calls), `PUBLIC_GATEWAY_URL` (browser WebSocket),
`SITE_URL` (OAuth redirects).
