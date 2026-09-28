# API gateway

The only public entry point (`/api/*`). It forwards each resource to the service that owns it
and adds the cross-cutting concerns.

| | |
| --- | --- |
| Port | 4000 |
| Routing table | [`src/routing/routes.ts`](src/routing/routes.ts) |

- **Resource routing**: `/api/products` → catalog, `/api/auth` → identity, `/api/realtime` →
  engagement (WebSockets), and so on. Bodies are streamed, never parsed.
- **Internal endpoints are unreachable** from outside (`/internal/*` → 404).
- **Zero trust**: the gateway forwards the bearer token; each service verifies it itself.
- **Rate limiting in Redis** (shared by all replicas): 20/min for sign-in endpoints, 120/min for
  writes, 600/min for reads, per client IP (the web BFF forwards the browser IP).
- **Circuit breaker per service** with fast `503 + Retry-After` while it is open.
- **API composition**: `GET /api/storefront/home` builds the home page from catalog and
  identity in one call, degrading sections that fail.
- **Aggregated health** (`/api/health`) and a **unified Swagger UI** (`/docs`) with a selector
  per service. Specs are fetched live and rewritten to go through the gateway.

```bash
npm run build -w @mercadia/gateway && npm start -w @mercadia/gateway
npm test -w @mercadia/gateway    # 19 tests (routing, breaker, e2e with fake services)
```
