# Deployment

## Free demo (Render)

The services are built to run in separate containers, but the free tier gives 512 MB per
instance, no private network, and instances sleep when idle. The demo therefore uses three
web services (`render.yaml`):

```
            browser
               │  https
   ┌───────────┴───────────┐
   ▼                       ▼  Socket.IO
mercadia-web ──────► mercadia-api  (one Node process, ~220 MB)
 Next.js BFF          gateway :$PORT → identity, catalog, orders, payments,
                                        fulfillment, engagement on 127.0.0.1
                            ▲   │
          /api/_svc/* + key │   │ /api/ai/*
                            │   ▼
                        mercadia-ai  (FastAPI)

 MongoDB Atlas M0 · Neon Postgres · Upstash Redis (event stream) · Cloudinary
```

- **`deploy/api`** starts every NestJS service in one process (`server.mjs`). Nothing in the
  services changes: each keeps its own Nest module, database, outbox relay and consumer
  group; `<SERVICE>_<KEY>` variables (see `service-kit`) give each one its port and database.
  On boot it creates one Postgres database per service on the Neon server if missing, and
  each service applies its migrations and seeds the demo data.
- **`/api/_svc/<service>/…`** is how the AI container reaches internal endpoints (catalog
  export, JWKS) without a private network: the gateway forwards it only with the
  `x-internal-key` header (constant-time comparison), over HTTPS.
- **Sessions survive restarts** because `JWT_PRIVATE_KEY` and `ENCRYPTION_KEY` are fixed in
  the environment instead of generated at boot.
- Cold starts: a sleeping free instance takes about a minute to wake up.

## Local, all in containers

`docker compose up --build` runs the same three images plus MongoDB (Atlas Local), Postgres,
Redis and Mailpit. For development with hot reload, run only the infrastructure
(`npm run infra:up`) and the apps on the host.

## Observability (local)

```bash
docker compose -f docker-compose.infra.yml up -d jaeger prometheus grafana
npm run build && npm run start:traced   # every service as its own process, traced
```

- **Traces** (OpenTelemetry → Jaeger, http://localhost:16686): the Node services use the
  zero-code auto-instrumentation (`node --import @opentelemetry/auto-instrumentations-node/register`),
  the AI service runs under `opentelemetry-instrument`. HTTP, Express, pg, MongoDB, ioredis,
  httpx and pymongo spans are linked by W3C trace context, so one trace follows a request
  from the gateway through the AI service to catalog.
- **Metrics** (Prometheus, http://localhost:9090): every service exposes `/metrics` with the
  same `http_server_duration_seconds` histogram (service, method, route, status) plus process
  and event-loop metrics; the AI service adds `ai_assistant_replies_total` by provider.
- **Dashboard** (Grafana, http://localhost:3030): *Mercadia · Service overview* is provisioned
  from `deploy/observability/grafana/dashboards`: throughput, 5xx rate, p95 per service,
  slowest routes, memory, event-loop lag and assistant replies.
- Logs are structured JSON (pino) with the request id; tracing is off in the free demo to keep
  memory low.
