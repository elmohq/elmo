# Elmo 
# Supports: web app (Nitro server) and worker

# Mention-judge weights: a weights-only image published from elmohq/elmo-models under its own
# license. Pinned by digest so a worker build always gets exactly the model it was tested with.
ARG MENTION_JUDGE_IMAGE=ghcr.io/elmohq/mention-judge:0.1.0@sha256:979607be9555c8b06dc4d5dcb158368f0cde45f4da64c459786da7869e58cfcf
FROM ${MENTION_JUDGE_IMAGE} AS mention-judge

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
COPY --from=deps /app/packages/deployment/node_modules ./packages/deployment/node_modules
COPY --from=deps /app/packages/og/node_modules ./packages/og/node_modules

# Copy source code
COPY . .

# The web bundle and the two pruned deployments below read the same tree and
# write nothing the others read, so they are separate stages: BuildKit runs
# them concurrently instead of spending the bundle's minute before starting on
# the deploys.

# Web application bundle
FROM builder AS web-build

RUN pnpm --filter @workspace/web build

# Pruned standalone deployments (only each package's own deps)
# --legacy: allows deploy without inject-workspace-packages (which breaks Alpine Docker builds)
FROM builder AS worker-deploy
RUN pnpm --filter @workspace/worker deploy --legacy /deploy/worker

FROM builder AS lib-deploy
RUN pnpm --filter @workspace/lib deploy --legacy /deploy/lib

# Runner stage for web app (Nitro)
FROM base AS web
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 elmo

# Copy entrypoint script
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Copy Nitro output - this is the entire server bundle
COPY --from=web-build --chown=elmo:nodejs /app/apps/web/.output ./.output

USER elmo

EXPOSE 3000
ENV PORT=3000
ENV HOST="0.0.0.0"

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", ".output/server/index.mjs"]

# Migration stage — runs drizzle-kit migrate then exits
FROM base AS migrate
WORKDIR /app

COPY --from=lib-deploy /deploy/lib ./

CMD ["npx", "drizzle-kit", "migrate"]

# Worker stage. Debian rather than Alpine: ONNX Runtime's Linux binaries need glibc.
FROM node:24-slim AS worker
ARG TARGETARCH
WORKDIR /app

ENV NODE_ENV=production
ENV MENTION_JUDGE_DIR=/app/mention-judge
ENV ORT_DISABLE_TELEMETRY=1

RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs worker

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

COPY --from=worker-deploy --chown=worker:nodejs /deploy/worker ./
COPY --from=mention-judge --chown=worker:nodejs /mention-judge ./mention-judge

# onnxruntime-node ships binaries for every OS and architecture; keep only this image's.
RUN set -e; arch=x64; [ "$TARGETARCH" = "arm64" ] && arch=arm64; \
	for dir in $(find /app/node_modules -type d -path '*/onnxruntime-node/bin/napi-v*' -prune); do \
		find "$dir" -mindepth 1 -maxdepth 1 ! -name linux -exec rm -rf {} +; \
		find "$dir/linux" -mindepth 1 -maxdepth 1 ! -name "$arch" -exec rm -rf {} +; \
	done; \
	test -f /app/mention-judge/model.onnx

USER worker

ENTRYPOINT ["/entrypoint.sh"]
CMD ["npx", "tsx", "src/index.ts"]
