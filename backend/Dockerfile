# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage — compiles TypeScript to dist/
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Copy manifests first so `npm ci` is cached until dependencies actually change.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY server.ts ./
COPY src ./src

RUN npm run build

# ---------------------------------------------------------------------------
# Production stage — runtime dependencies only
# ---------------------------------------------------------------------------
FROM node:22-alpine AS production

# tini gives us correct PID 1 signal handling, so SIGTERM reaches Node and the
# graceful shutdown in server.ts (scheduler stop, DB disconnect) actually runs.
RUN apk add --no-cache tini

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Run unprivileged. The `node` user ships with the base image.
USER node

EXPOSE 5000

# Readiness endpoint returns 503 when the database or scheduler is degraded, so
# an unhealthy container is pulled out of rotation instead of serving errors.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
