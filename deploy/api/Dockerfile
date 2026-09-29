# API bundle: every NestJS service + the gateway in one container (see server.mjs).
# Build from the repository root: docker build -f deploy/api/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
# Every workspace manifest must be present for `npm ci` to accept the lockfile.
COPY . .
# Only the backend workspaces: the web app and the Python service have their own images.
RUN npm ci --no-audit --no-fund --include-workspace-root \
      -w @mercadia/contracts -w @mercadia/service-kit -w @mercadia/demo-data \
      -w @mercadia/identity -w @mercadia/catalog -w @mercadia/orders -w @mercadia/payments \
      -w @mercadia/fulfillment -w @mercadia/engagement -w @mercadia/gateway \
 && npm run build:packages \
 && for s in identity catalog orders payments fulfillment engagement gateway; do \
      npm run build -w @mercadia/$s || exit 1; done \
 && npm prune --omit=dev \
      -w @mercadia/contracts -w @mercadia/service-kit -w @mercadia/demo-data \
      -w @mercadia/identity -w @mercadia/catalog -w @mercadia/orders -w @mercadia/payments \
      -w @mercadia/fulfillment -w @mercadia/engagement -w @mercadia/gateway \
 && rm -rf apps services/ai services/*/src services/*/test packages/*/src scripts

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
COPY deploy/api/server.mjs ./deploy/api/server.mjs
USER node
EXPOSE 4000
# A single process: keep the heap below the 512 MB of the free instance.
CMD ["node", "--max-old-space-size=380", "deploy/api/server.mjs"]
