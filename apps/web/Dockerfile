# Next.js storefront (standalone output). Build from the repository root:
#   docker build -f apps/web/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
# Every workspace manifest must be present for `npm ci` to accept the lockfile.
COPY . .
RUN npm ci --no-audit --no-fund --include-workspace-root -w @mercadia/contracts -w @mercadia/web \
 && npm run build -w @mercadia/contracts \
 && npm run build -w @mercadia/web

FROM node:22-alpine
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
# The standalone server mirrors the monorepo layout (apps/web/server.js).
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
