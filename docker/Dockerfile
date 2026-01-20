# Elmo - Multi-stage Dockerfile
# Supports: web app, worker

# Base stage with Node.js
FROM node:24-alpine AS base
RUN corepack enable pnpm
# Install curl for healthchecks and token fetching
RUN apk add --no-cache curl

# Dependencies stage
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY packages/ui/package.json ./packages/ui/
COPY packages/config/package.json ./packages/config/
COPY packages/local/package.json ./packages/local/
COPY packages/demo/package.json ./packages/demo/
COPY packages/whitelabel/package.json ./packages/whitelabel/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Builder stage
FROM base AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=deps /app/packages/ui/node_modules ./packages/ui/node_modules
COPY --from=deps /app/packages/config/node_modules ./packages/config/node_modules
COPY --from=deps /app/packages/local/node_modules ./packages/local/node_modules
COPY --from=deps /app/packages/demo/node_modules ./packages/demo/node_modules
COPY --from=deps /app/packages/whitelabel/node_modules ./packages/whitelabel/node_modules

# Copy source code
COPY . .

# Build arguments
ARG DEPLOYMENT_MODE=local
ENV DEPLOYMENT_MODE=${DEPLOYMENT_MODE}
ENV NEXT_PUBLIC_DEPLOYMENT_MODE=${DEPLOYMENT_MODE}
ENV NEXT_TELEMETRY_DISABLED=1

# Build the application (skip tests - they run in CI)
RUN pnpm --filter @workspace/web build:docker

# Runner stage for web app
FROM base AS web
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy entrypoint script
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Copy built assets
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

# Create config directory for Tinybird token
RUN mkdir -p /app/tinybird-config && chown nextjs:nodejs /app/tinybird-config

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "apps/web/server.js"]

# Worker stage
FROM base AS worker
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 worker

# Copy entrypoint script
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Copy dependencies and source
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=deps /app/packages/ui/node_modules ./packages/ui/node_modules
COPY --from=deps /app/packages/config/node_modules ./packages/config/node_modules
COPY --from=deps /app/packages/local/node_modules ./packages/local/node_modules
COPY --from=deps /app/packages/demo/node_modules ./packages/demo/node_modules
COPY --from=deps /app/packages/whitelabel/node_modules ./packages/whitelabel/node_modules
COPY . .

# Create config directory for Tinybird token
RUN mkdir -p /app/tinybird-config && chown worker:nodejs /app/tinybird-config

USER worker

ENTRYPOINT ["/entrypoint.sh"]
CMD ["pnpm", "--filter", "@workspace/worker", "start"]
