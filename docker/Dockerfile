# Elmo 
# Supports: web app (Nitro server) and worker

ARG ELMO_RELEASE_VERSION

# Base stage with Node.js
FROM node:24-alpine AS base
RUN corepack enable pnpm
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
COPY packages/lib/package.json ./packages/lib/
COPY packages/local/package.json ./packages/local/
COPY packages/whitelabel/package.json ./packages/whitelabel/
COPY packages/cloud/package.json ./packages/cloud/
COPY packages/deployment/package.json ./packages/deployment/
COPY packages/og/package.json ./packages/og/
COPY packages/api-spec/package.json ./packages/api-spec/

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
COPY --from=deps /app/packages/lib/node_modules ./packages/lib/node_modules
COPY --from=deps /app/packages/local/node_modules ./packages/local/node_modules
COPY --from=deps /app/packages/whitelabel/node_modules ./packages/whitelabel/node_modules
COPY --from=deps /app/packages/cloud/node_modules ./packages/cloud/node_modules
COPY --from=deps /app/packages/deployment/node_modules ./packages/deployment/node_modules
COPY --from=deps /app/packages/og/node_modules ./packages/og/node_modules

# Copy source code
COPY . .

# Build arguments for VITE_ env vars (baked into client bundle)
ARG DEPLOYMENT_MODE=local
ARG VITE_DEPLOYMENT_MODE=${DEPLOYMENT_MODE}
ENV VITE_DEPLOYMENT_MODE=${VITE_DEPLOYMENT_MODE}

# Build the web application (increase heap for large bundles)
RUN pnpm --filter @workspace/web build

# Create pruned standalone deployments (only each package's own deps)
# --legacy: allows deploy without inject-workspace-packages (which breaks Alpine Docker builds)
RUN pnpm --filter @workspace/worker deploy --legacy /deploy/worker
RUN pnpm --filter @workspace/lib deploy --legacy /deploy/lib

# Runner stage for web app (Nitro)
FROM base AS web
WORKDIR /app

ARG ELMO_RELEASE_VERSION
LABEL com.elmohq.elmo.schema-compatibility="0020"
LABEL com.elmohq.elmo.release-version="${ELMO_RELEASE_VERSION}"
LABEL com.elmohq.elmo.runtime-fence-generation="0020"

ENV NODE_ENV=production
ENV ELMO_RUNTIME_FENCE_GENERATION="0020"
ENV SERVER_SHUTDOWN_TIMEOUT="3600"
RUN printf '0020\n' > /app/.elmo-runtime-fence-generation && chmod 0444 /app/.elmo-runtime-fence-generation

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 elmo

# Copy entrypoint script
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Copy Nitro output - this is the entire server bundle
COPY --from=builder --chown=elmo:nodejs /app/apps/web/.output ./.output

USER elmo

EXPOSE 3000
ENV PORT=3000
ENV HOST="0.0.0.0"

HEALTHCHECK --interval=5s --timeout=5s --start-period=30s --retries=30 \
  CMD curl --fail --silent http://127.0.0.1:3000/api/setup-status | grep --quiet '"ready":true'

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", ".output/server/index.mjs"]

# Migration stage — serializes Drizzle migrations with a database-held lock
FROM base AS migrate
WORKDIR /app

ARG ELMO_RELEASE_VERSION
LABEL com.elmohq.elmo.schema-compatibility="0020"
LABEL com.elmohq.elmo.release-version="${ELMO_RELEASE_VERSION}"
LABEL com.elmohq.elmo.runtime-fence-generation="0020"

COPY --from=builder /deploy/lib ./

CMD ["./node_modules/.bin/tsx", "scripts/migrate.ts"]

# Worker stage
FROM base AS worker
WORKDIR /app

ARG ELMO_RELEASE_VERSION
LABEL com.elmohq.elmo.schema-compatibility="0020"
LABEL com.elmohq.elmo.release-version="${ELMO_RELEASE_VERSION}"
LABEL com.elmohq.elmo.runtime-fence-generation="0020"

ENV NODE_ENV=production
ENV ELMO_RUNTIME_FENCE_GENERATION="0020"
RUN printf '0020\n' > /app/.elmo-runtime-fence-generation && chmod 0444 /app/.elmo-runtime-fence-generation

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 worker

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

COPY --from=builder --chown=worker:nodejs /deploy/worker ./

USER worker

HEALTHCHECK --interval=5s --timeout=5s --start-period=30s --retries=30 \
  CMD test -f /tmp/elmo-worker-ready && kill -0 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["./node_modules/.bin/tsx", "src/index.ts"]
