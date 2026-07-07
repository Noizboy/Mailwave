# Multi-stage Dockerfile for Mailwave.
#
# Targets:
#   runner  — Next.js standalone app (port 3001, non-root, HEALTHCHECK).
#   worker  — BullMQ worker running `npx tsx jobs/worker.ts` (non-root).
#
# Build:
#   app:     docker build -t mailwave -t mailwave:app .
#   worker:  docker build --target worker -t mailwave-worker .
# Run:
#   docker run -p 3001:3001 \
#     -e DATABASE_URL=... -e AUTH_SECRET=... -e ENCRYPTION_KEY=... \
#     -e REDIS_URL=... -e NEXTAUTH_URL=https://your-domain.com \
#     mailwave
#
# In Compose the `app` and `worker` services override the entrypoint with
# docker/app-entrypoint.sh and docker/worker-entrypoint.sh respectively,
# which wait for Postgres/Redis before exec'ing the runtime command.

# ---- deps stage -----------------------------------------------------------
FROM node:20-bookworm-slim AS deps
WORKDIR /app

# OpenSSL is required by Prisma's query engine on Debian slim images.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN npm ci

# ---- build stage ----------------------------------------------------------
FROM node:20-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Placeholder env vars needed at build time (Prisma config + Next build).
# Real secrets are provided at runtime.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public" \
    NEXTAUTH_URL="http://localhost:3001" \
    AUTH_SECRET="build-time-placeholder-not-used-at-runtime-32chars" \
    ENCRYPTION_KEY="build-time-placeholder-not-used-at-runtime-32chars"

RUN npx prisma generate
RUN npm run build

# ---- runner stage (minimal app runtime image) -----------------------------
FROM node:20-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

# Next.js standalone output copies only the files needed to run.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Prisma generated client + schema (needed at runtime).
COPY --from=builder --chown=nextjs:nodejs /app/app/generated/prisma ./app/generated/prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# App entrypoint (waits for Postgres, then exec node server.js).
COPY --chown=nextjs:nodejs docker/app-entrypoint.sh /app/app-entrypoint.sh
RUN chmod +x /app/app-entrypoint.sh

USER nextjs

ENV NODE_ENV=production \
    PORT=3001 \
    HOSTNAME=0.0.0.0

EXPOSE 3001

# Liveness probe — uses Node's built-in fetch (no curl/wget in slim image).
# /api/health returns 200 {"status":"ok"} without touching the DB.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/app-entrypoint.sh"]
# Next.js standalone server entrypoint (exec'd by the entrypoint).
CMD ["node", "server.js"]

# ---- worker stage (BullMQ worker runtime image) ---------------------------
# The worker runs jobs/worker.ts via tsx. tsx is a runtime dependency
# (see package.json `dependencies`) because the worker executes TypeScript
# at runtime; it is NOT needed by the Next.js standalone app image above.
# We reuse the full node_modules from the builder stage so prisma CLI,
# @prisma/client, and tsx are all available without a separate install step.
FROM node:20-bookworm-slim AS worker
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

# Full node_modules (incl. tsx, prisma CLI, @prisma, .prisma).
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
# Worker source + transitive imports.
COPY --from=builder --chown=nextjs:nodejs /app/jobs ./jobs
COPY --from=builder --chown=nextjs:nodejs /app/lib ./lib
# Prisma generated client + schema (needed at runtime by lib/db).
COPY --from=builder --chown=nextjs:nodejs /app/app/generated/prisma ./app/generated/prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
# package.json + tsconfig.json so `npx tsx` and TS path resolution work.
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json

# Worker entrypoint (waits for Redis + Postgres, then exec npx tsx jobs/worker.ts).
COPY --chown=nextjs:nodejs docker/worker-entrypoint.sh /app/worker-entrypoint.sh
RUN chmod +x /app/worker-entrypoint.sh

USER nextjs

ENV NODE_ENV=production

ENTRYPOINT ["/app/worker-entrypoint.sh"]
CMD ["npx", "tsx", "jobs/worker.ts"]
